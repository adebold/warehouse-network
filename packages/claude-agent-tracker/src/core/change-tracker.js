// Change Tracker - Monitor and analyze code changes
import { Database } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { v4 as uuid } from 'uuid';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import chokidar from 'chokidar';
import { glob } from 'glob';

export class ChangeTracker {
  constructor() {
    this.db = new Database();
    this.watchers = new Map();
    this.monitoringSessions = new Map();
    this.initializeDatabase();
  }

  async initializeDatabase() {
    await this.db.initialize();
    
    // Create tables for change tracking
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS code_changes (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        file_path TEXT NOT NULL,
        change_type TEXT NOT NULL,
        impact_level TEXT NOT NULL,
        agent_id TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        file_hash TEXT,
        lines_added INTEGER DEFAULT 0,
        lines_deleted INTEGER DEFAULT 0,
        size_before INTEGER,
        size_after INTEGER,
        metadata TEXT,
        git_commit TEXT,
        change_reason TEXT
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS file_dependencies (
        id TEXT PRIMARY KEY,
        source_file TEXT NOT NULL,
        target_file TEXT NOT NULL,
        dependency_type TEXT NOT NULL,
        project_path TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS monitoring_sessions (
        id TEXT PRIMARY KEY,
        project_path TEXT NOT NULL,
        watch_patterns TEXT NOT NULL,
        notifications TEXT,
        thresholds TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS impact_analysis (
        id TEXT PRIMARY KEY,
        change_id TEXT NOT NULL,
        analysis_type TEXT NOT NULL,
        risk_score REAL NOT NULL,
        affected_components TEXT,
        recommendations TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (change_id) REFERENCES code_changes(id)
      )
    `);
  }

  /**
   * Track code changes
   */
  async trackChanges(changeData) {
    const {
      projectPath,
      changeType,
      files,
      impact,
      agentId,
      timestamp,
      gitCommit,
      changeReason
    } = changeData;

    const changes = [];

    for (const filePath of files) {
      const changeId = uuid();
      const fullPath = path.join(projectPath, filePath);
      
      // Calculate file metrics
      const fileStats = await this.calculateFileMetrics(fullPath);
      
      const changeRecord = {
        id: changeId,
        project_path: projectPath,
        file_path: filePath,
        change_type: changeType,
        impact_level: impact,
        agent_id: agentId,
        timestamp: timestamp || new Date().toISOString(),
        file_hash: fileStats.hash,
        lines_added: fileStats.linesAdded,
        lines_deleted: fileStats.linesDeleted,
        size_before: fileStats.sizeBefore,
        size_after: fileStats.sizeAfter,
        git_commit: gitCommit,
        change_reason: changeReason,
        metadata: JSON.stringify({
          extension: path.extname(filePath),
          directory: path.dirname(filePath),
          ...fileStats.metadata
        })
      };

      await this.db.query(`
        INSERT INTO code_changes 
        (id, project_path, file_path, change_type, impact_level, agent_id, 
         timestamp, file_hash, lines_added, lines_deleted, size_before, 
         size_after, git_commit, change_reason, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, Object.values(changeRecord));

      changes.push(changeRecord);

      // Analyze dependencies
      await this.analyzeDependencies(projectPath, filePath, changeId);

      // Perform impact analysis
      if (impact === 'high' || impact === 'critical') {
        await this.performImpactAnalysis(changeId, changeRecord);
      }

      logger.info(`Change tracked: ${filePath} (${changeType}) - ${impact} impact`);
    }

    return changes;
  }

  /**
   * Calculate file metrics
   */
  async calculateFileMetrics(filePath) {
    let stats = {
      hash: null,
      linesAdded: 0,
      linesDeleted: 0,
      sizeBefore: 0,
      sizeAfter: 0,
      metadata: {}
    };

    try {
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf-8');
        stats.hash = crypto.createHash('md5').update(content).digest('hex');
        stats.sizeAfter = content.length;
        stats.linesAdded = content.split('\n').length;
        
        // Basic code metrics
        stats.metadata = {
          lineCount: content.split('\n').length,
          characterCount: content.length,
          hasTests: /test|spec/i.test(content) || /describe|it|test\(/i.test(content),
          hasComments: /\/\*|\*\/|\/\/|#/i.test(content),
          complexity: this.calculateComplexity(content)
        };
      }
    } catch (error) {
      logger.error(`Failed to calculate metrics for ${filePath}:`, error);
    }

    return stats;
  }

  /**
   * Calculate basic code complexity
   */
  calculateComplexity(content) {
    // Simple complexity based on control structures
    const controlStructures = [
      /\bif\b/gi,
      /\belse\b/gi,
      /\bfor\b/gi,
      /\bwhile\b/gi,
      /\bswitch\b/gi,
      /\btry\b/gi,
      /\bcatch\b/gi,
      /\?\s*:/gi  // ternary operator
    ];

    let complexity = 1; // base complexity
    for (const pattern of controlStructures) {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Analyze file dependencies
   */
  async analyzeDependencies(projectPath, filePath, changeId) {
    try {
      const fullPath = path.join(projectPath, filePath);
      
      if (!await fs.pathExists(fullPath)) {
        return;
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      
      // Extract imports/requires (basic patterns)
      const dependencies = this.extractDependencies(content, filePath);
      
      for (const dep of dependencies) {
        const depId = uuid();
        
        await this.db.query(`
          INSERT INTO file_dependencies 
          (id, source_file, target_file, dependency_type, project_path)
          VALUES (?, ?, ?, ?, ?)
        `, [depId, filePath, dep.path, dep.type, projectPath]);
      }
      
    } catch (error) {
      logger.error(`Failed to analyze dependencies for ${filePath}:`, error);
    }
  }

  /**
   * Extract dependencies from file content
   */
  extractDependencies(content, filePath) {
    const dependencies = [];
    
    // JavaScript/TypeScript imports
    const importPatterns = [
      /import\s+.*\s+from\s+['"`]([^'"`]+)['"`]/g,
      /require\(['"`]([^'"`]+)['"`]\)/g,
      /import\(['"`]([^'"`]+)['"`]\)/g
    ];

    for (const pattern of importPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        
        // Skip node_modules
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
          continue;
        }
        
        dependencies.push({
          path: importPath,
          type: 'import'
        });
      }
    }

    // CSS imports
    const cssPattern = /@import\s+['"`]([^'"`]+)['"`]/g;
    let cssMatch;
    while ((cssMatch = cssPattern.exec(content)) !== null) {
      dependencies.push({
        path: cssMatch[1],
        type: 'css-import'
      });
    }

    return dependencies;
  }

  /**
   * Perform impact analysis
   */
  async performImpactAnalysis(changeId, changeRecord) {
    const analysis = {
      id: uuid(),
      change_id: changeId,
      analysis_type: 'automated',
      risk_score: this.calculateRiskScore(changeRecord),
      affected_components: await this.findAffectedComponents(changeRecord),
      recommendations: this.generateRecommendations(changeRecord)
    };

    await this.db.query(`
      INSERT INTO impact_analysis 
      (id, change_id, analysis_type, risk_score, affected_components, recommendations)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      analysis.id,
      analysis.change_id,
      analysis.analysis_type,
      analysis.risk_score,
      JSON.stringify(analysis.affected_components),
      JSON.stringify(analysis.recommendations)
    ]);

    return analysis;
  }

  /**
   * Calculate risk score
   */
  calculateRiskScore(changeRecord) {
    let score = 1.0;

    // File type risk factors
    const criticalFiles = [
      'package.json',
      'docker-compose.yml',
      'Dockerfile',
      '.env',
      'config/',
      'src/config/',
      'migrations/'
    ];

    const highRiskExtensions = ['.sql', '.json', '.yml', '.yaml', '.conf'];
    
    if (criticalFiles.some(file => changeRecord.file_path.includes(file))) {
      score += 2.0;
    }
    
    if (highRiskExtensions.some(ext => changeRecord.file_path.endsWith(ext))) {
      score += 1.0;
    }

    // Change type risk factors
    const riskFactors = {
      'delete': 2.0,
      'refactor': 1.5,
      'modify': 1.0,
      'create': 0.5
    };
    
    score += (riskFactors[changeRecord.change_type] || 1.0);

    // Size-based risk
    if (changeRecord.lines_added > 100) {
      score += 1.0;
    }
    
    if (changeRecord.lines_deleted > 50) {
      score += 1.5;
    }

    return Math.min(score, 10.0); // Cap at 10
  }

  /**
   * Find affected components
   */
  async findAffectedComponents(changeRecord) {
    const components = [];
    
    // Find files that import this file
    const dependents = await this.db.query(`
      SELECT DISTINCT source_file 
      FROM file_dependencies 
      WHERE target_file LIKE ? AND project_path = ?
    `, [`%${changeRecord.file_path}%`, changeRecord.project_path]);

    components.push(...dependents.map(d => d.source_file));

    // Check for test files
    const testPattern = changeRecord.file_path.replace(/\.(js|ts|jsx|tsx)$/, '');
    const testFiles = await glob(`**/*${testPattern}*.{test,spec}.{js,ts,jsx,tsx}`, {
      cwd: changeRecord.project_path
    });
    
    components.push(...testFiles);

    return [...new Set(components)]; // Remove duplicates
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(changeRecord) {
    const recommendations = [];

    // Based on file type
    if (changeRecord.file_path.includes('package.json')) {
      recommendations.push('Run npm audit after dependency changes');
      recommendations.push('Update lockfile and verify compatibility');
    }

    if (changeRecord.file_path.includes('docker')) {
      recommendations.push('Test container build and deployment');
      recommendations.push('Verify security scanning results');
    }

    // Based on change type
    if (changeRecord.change_type === 'delete') {
      recommendations.push('Verify no references remain');
      recommendations.push('Check for broken imports');
    }

    if (changeRecord.lines_added > 50) {
      recommendations.push('Add unit tests for new functionality');
      recommendations.push('Consider breaking into smaller changes');
    }

    return recommendations;
  }

  /**
   * Setup monitoring
   */
  async setupMonitoring(options) {
    const {
      projectPath,
      watchPatterns,
      notifications = {},
      thresholds = {}
    } = options;

    const monitoringId = uuid();
    
    // Store monitoring configuration
    await this.db.query(`
      INSERT INTO monitoring_sessions 
      (id, project_path, watch_patterns, notifications, thresholds)
      VALUES (?, ?, ?, ?, ?)
    `, [
      monitoringId,
      projectPath,
      JSON.stringify(watchPatterns),
      JSON.stringify(notifications),
      JSON.stringify(thresholds)
    ]);

    // Setup file watcher
    const watcher = chokidar.watch(watchPatterns, {
      cwd: projectPath,
      ignored: /node_modules|\.git/,
      persistent: true
    });

    watcher.on('change', async (filePath) => {
      await this.handleFileChange(monitoringId, projectPath, filePath, 'modify');
    });

    watcher.on('add', async (filePath) => {
      await this.handleFileChange(monitoringId, projectPath, filePath, 'create');
    });

    watcher.on('unlink', async (filePath) => {
      await this.handleFileChange(monitoringId, projectPath, filePath, 'delete');
    });

    this.watchers.set(monitoringId, watcher);
    this.monitoringSessions.set(monitoringId, options);

    logger.info(`Monitoring setup for ${projectPath} with ID: ${monitoringId}`);
    
    return monitoringId;
  }

  /**
   * Handle file change event
   */
  async handleFileChange(monitoringId, projectPath, filePath, changeType) {
    try {
      // Track the change
      await this.trackChanges({
        projectPath,
        changeType,
        files: [filePath],
        impact: this.assessImpact(filePath),
        agentId: 'file-watcher',
        timestamp: new Date().toISOString(),
        changeReason: 'file-system-change'
      });

      // Update monitoring session activity
      await this.db.query(`
        UPDATE monitoring_sessions 
        SET last_activity = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [monitoringId]);

    } catch (error) {
      logger.error(`Error handling file change for ${filePath}:`, error);
    }
  }

  /**
   * Assess change impact based on file
   */
  assessImpact(filePath) {
    const criticalPatterns = [
      /package\.json$/,
      /docker/i,
      /config/i,
      /\.env/,
      /migration/i
    ];

    const highPatterns = [
      /\.(sql|yml|yaml|conf)$/,
      /test|spec/i
    ];

    if (criticalPatterns.some(pattern => pattern.test(filePath))) {
      return 'critical';
    }
    
    if (highPatterns.some(pattern => pattern.test(filePath))) {
      return 'high';
    }
    
    return 'medium';
  }

  /**
   * Analyze impact of changes
   */
  async analyzeImpact(options) {
    const { changes, projectPath, analysisType } = options;
    
    const analysis = {
      type: analysisType,
      summary: {},
      details: [],
      recommendations: []
    };

    for (const change of changes) {
      let changeAnalysis = {};
      
      switch (analysisType) {
        case 'risk':
          changeAnalysis = await this.performRiskAnalysis(change, projectPath);
          break;
        case 'complexity':
          changeAnalysis = await this.performComplexityAnalysis(change, projectPath);
          break;
        case 'dependencies':
          changeAnalysis = await this.performDependencyAnalysis(change, projectPath);
          break;
        case 'security':
          changeAnalysis = await this.performSecurityAnalysis(change, projectPath);
          break;
        case 'performance':
          changeAnalysis = await this.performPerformanceAnalysis(change, projectPath);
          break;
      }
      
      analysis.details.push(changeAnalysis);
    }

    // Generate summary
    analysis.summary = this.generateAnalysisSummary(analysis.details, analysisType);
    
    return analysis;
  }

  /**
   * Get recent changes
   */
  async getRecentChanges(limit = 50, projectPath = null) {
    let query = `
      SELECT * FROM code_changes 
      ${projectPath ? 'WHERE project_path = ?' : ''}
      ORDER BY timestamp DESC 
      LIMIT ?
    `;
    
    const params = projectPath ? [projectPath, limit] : [limit];
    const changes = await this.db.query(query, params);

    return changes.map(change => ({
      ...change,
      metadata: JSON.parse(change.metadata || '{}')
    }));
  }

  /**
   * Perform risk analysis
   */
  async performRiskAnalysis(change, projectPath) {
    const riskScore = this.calculateRiskScore({
      file_path: change.file,
      change_type: change.changeType,
      lines_added: change.linesAdded,
      lines_deleted: change.linesDeleted
    });

    return {
      file: change.file,
      riskScore,
      riskLevel: riskScore > 5 ? 'high' : riskScore > 3 ? 'medium' : 'low',
      factors: this.identifyRiskFactors(change)
    };
  }

  /**
   * Generate analysis summary
   */
  generateAnalysisSummary(details, analysisType) {
    const summary = {
      totalFiles: details.length,
      analysisType
    };

    if (analysisType === 'risk') {
      const riskLevels = details.reduce((acc, d) => {
        acc[d.riskLevel] = (acc[d.riskLevel] || 0) + 1;
        return acc;
      }, {});
      summary.riskDistribution = riskLevels;
    }

    return summary;
  }

  /**
   * Identify risk factors
   */
  identifyRiskFactors(change) {
    const factors = [];
    
    if (change.linesAdded > 100) factors.push('Large addition');
    if (change.linesDeleted > 50) factors.push('Significant deletion');
    if (change.file.includes('config')) factors.push('Configuration change');
    if (change.file.includes('package.json')) factors.push('Dependency change');
    
    return factors;
  }

  /**
   * Stop monitoring
   */
  async stopMonitoring(monitoringId) {
    const watcher = this.watchers.get(monitoringId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(monitoringId);
    }

    this.monitoringSessions.delete(monitoringId);

    await this.db.query(`
      UPDATE monitoring_sessions 
      SET status = 'stopped' 
      WHERE id = ?
    `, [monitoringId]);

    logger.info(`Stopped monitoring session: ${monitoringId}`);
  }

  /**
   * Get monitoring status
   */
  async getMonitoringStatus() {
    const sessions = await this.db.query(`
      SELECT * FROM monitoring_sessions 
      WHERE status = 'active'
      ORDER BY created_at DESC
    `);

    return sessions.map(session => ({
      ...session,
      watchPatterns: JSON.parse(session.watch_patterns),
      notifications: JSON.parse(session.notifications || '{}'),
      thresholds: JSON.parse(session.thresholds || '{}'),
      isActive: this.watchers.has(session.id)
    }));
  }
}