// Report Generator - Generate comprehensive change and activity reports
import { Database } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { v4 as uuid } from 'uuid';
import fs from 'fs-extra';
import path from 'path';

export class ReportGenerator {
  constructor() {
    this.db = new Database();
    this.initializeDatabase();
  }

  async initializeDatabase() {
    await this.db.initialize();
    
    // Create tables for report generation
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS generated_reports (
        id TEXT PRIMARY KEY,
        report_type TEXT NOT NULL,
        project_path TEXT,
        format TEXT NOT NULL,
        timeframe_start DATETIME,
        timeframe_end DATETIME,
        file_path TEXT,
        summary TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'generated'
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS report_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        template_content TEXT NOT NULL,
        format TEXT NOT NULL,
        variables TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Generate comprehensive report
   */
  async generateReport(options) {
    const {
      projectPath,
      timeframe,
      format,
      includeMetrics = true,
      customTimeframe = null,
      reportType = 'comprehensive'
    } = options;

    const reportId = uuid();
    const { startDate, endDate } = this.parseTimeframe(timeframe, customTimeframe);

    // Collect data
    const data = await this.collectReportData(projectPath, startDate, endDate, includeMetrics);
    
    // Generate report content
    let reportContent;
    switch (format) {
      case 'json':
        reportContent = this.generateJSONReport(data, reportId);
        break;
      case 'markdown':
        reportContent = this.generateMarkdownReport(data, reportId);
        break;
      case 'html':
        reportContent = this.generateHTMLReport(data, reportId);
        break;
      case 'pdf':
        reportContent = await this.generatePDFReport(data, reportId);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    // Save report
    const reportPath = await this.saveReport(reportId, format, reportContent, projectPath);

    // Store report metadata
    await this.db.query(`
      INSERT INTO generated_reports 
      (id, report_type, project_path, format, timeframe_start, timeframe_end, 
       file_path, summary, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      reportId,
      reportType,
      projectPath,
      format,
      startDate.toISOString(),
      endDate.toISOString(),
      reportPath,
      data.summary.overview,
      JSON.stringify({
        includeMetrics,
        timeframe,
        totalActivities: data.summary.totalActivities,
        totalChanges: data.summary.totalChanges,
        activeAgents: data.summary.activeAgents.length
      })
    ]);

    logger.info(`Report generated: ${reportId} (${format}) for ${projectPath}`);

    return {
      reportId,
      reportPath,
      format,
      summary: data.summary,
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Parse timeframe
   */
  parseTimeframe(timeframe, customTimeframe) {
    const endDate = new Date();
    let startDate;

    if (timeframe === 'custom' && customTimeframe) {
      startDate = new Date(customTimeframe.start);
      return { startDate, endDate: new Date(customTimeframe.end) };
    }

    switch (timeframe) {
      case 'last_hour':
        startDate = new Date(endDate.getTime() - 60 * 60 * 1000);
        break;
      case 'last_day':
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'last_week':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'last_month':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  /**
   * Collect report data
   */
  async collectReportData(projectPath, startDate, endDate, includeMetrics) {
    const data = {
      activities: [],
      changes: [],
      metrics: {},
      agents: [],
      tasks: [],
      summary: {}
    };

    // Get activities
    let activitiesQuery = `
      SELECT * FROM agent_activities 
      WHERE timestamp BETWEEN ? AND ?
    `;
    let params = [startDate.toISOString(), endDate.toISOString()];

    if (projectPath) {
      activitiesQuery += ' AND (project_path = ? OR project_path IS NULL)';
      params.push(projectPath);
    }

    activitiesQuery += ' ORDER BY timestamp DESC';
    data.activities = await this.db.query(activitiesQuery, params);

    // Get changes
    let changesQuery = `
      SELECT * FROM code_changes 
      WHERE timestamp BETWEEN ? AND ?
    `;
    params = [startDate.toISOString(), endDate.toISOString()];

    if (projectPath) {
      changesQuery += ' AND project_path = ?';
      params.push(projectPath);
    }

    changesQuery += ' ORDER BY timestamp DESC';
    data.changes = await this.db.query(changesQuery, params);

    // Get agents
    data.agents = await this.getActiveAgentsInPeriod(startDate, endDate, projectPath);

    // Get tasks
    data.tasks = await this.getTasksInPeriod(startDate, endDate);

    // Get metrics if requested
    if (includeMetrics) {
      data.metrics = await this.getMetricsInPeriod(startDate, endDate, projectPath);
    }

    // Generate summary
    data.summary = this.generateDataSummary(data, startDate, endDate);

    return data;
  }

  /**
   * Get active agents in period
   */
  async getActiveAgentsInPeriod(startDate, endDate, projectPath) {
    let query = `
      SELECT 
        agent_id,
        COUNT(*) as activity_count,
        MAX(timestamp) as last_activity,
        MIN(timestamp) as first_activity
      FROM agent_activities 
      WHERE timestamp BETWEEN ? AND ?
    `;
    let params = [startDate.toISOString(), endDate.toISOString()];

    if (projectPath) {
      query += ' AND (project_path = ? OR project_path IS NULL)';
      params.push(projectPath);
    }

    query += ' GROUP BY agent_id ORDER BY activity_count DESC';
    
    return await this.db.query(query, params);
  }

  /**
   * Get tasks in period
   */
  async getTasksInPeriod(startDate, endDate) {
    const tasks = await this.db.query(`
      SELECT * FROM task_plans 
      WHERE created_at BETWEEN ? AND ? 
         OR updated_at BETWEEN ? AND ?
      ORDER BY updated_at DESC
    `, [
      startDate.toISOString(), 
      endDate.toISOString(),
      startDate.toISOString(), 
      endDate.toISOString()
    ]);

    return tasks.map(task => ({
      ...task,
      dependencies: JSON.parse(task.dependencies || '[]'),
      milestones: JSON.parse(task.milestones || '[]')
    }));
  }

  /**
   * Get metrics in period
   */
  async getMetricsInPeriod(startDate, endDate, projectPath) {
    let metricsQuery = `
      SELECT 
        metric_type,
        agent_id,
        AVG(value) as avg_value,
        MAX(value) as max_value,
        MIN(value) as min_value,
        COUNT(*) as count
      FROM agent_metrics 
      WHERE timestamp BETWEEN ? AND ?
    `;
    let params = [startDate.toISOString(), endDate.toISOString()];

    if (projectPath) {
      // Note: agent_metrics doesn't have project_path, so we'll need to join
      metricsQuery = `
        SELECT 
          m.metric_type,
          m.agent_id,
          AVG(m.value) as avg_value,
          MAX(m.value) as max_value,
          MIN(m.value) as min_value,
          COUNT(*) as count
        FROM agent_metrics m
        INNER JOIN agent_activities a ON m.agent_id = a.agent_id
        WHERE m.timestamp BETWEEN ? AND ?
          AND (a.project_path = ? OR a.project_path IS NULL)
      `;
      params.push(projectPath);
    }

    metricsQuery += ' GROUP BY metric_type, agent_id ORDER BY metric_type, avg_value DESC';
    
    const metrics = await this.db.query(metricsQuery, params);
    
    // Organize by metric type
    const organized = {};
    for (const metric of metrics) {
      if (!organized[metric.metric_type]) {
        organized[metric.metric_type] = [];
      }
      organized[metric.metric_type].push(metric);
    }

    return organized;
  }

  /**
   * Generate data summary
   */
  generateDataSummary(data, startDate, endDate) {
    const period = `${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`;
    
    const summary = {
      period,
      totalActivities: data.activities.length,
      totalChanges: data.changes.length,
      activeAgents: data.agents,
      totalTasks: data.tasks.length,
      completedTasks: data.tasks.filter(t => t.status === 'completed').length,
      overview: ''
    };

    // Generate overview text
    summary.overview = `
Report for period ${period}:
- ${summary.totalActivities} agent activities recorded
- ${summary.totalChanges} code changes tracked
- ${summary.activeAgents.length} agents were active
- ${summary.completedTasks}/${summary.totalTasks} tasks completed
    `.trim();

    // Change impact breakdown
    const impactLevels = data.changes.reduce((acc, change) => {
      acc[change.impact_level] = (acc[change.impact_level] || 0) + 1;
      return acc;
    }, {});
    summary.impactBreakdown = impactLevels;

    // Change types breakdown
    const changeTypes = data.changes.reduce((acc, change) => {
      acc[change.change_type] = (acc[change.change_type] || 0) + 1;
      return acc;
    }, {});
    summary.changeTypeBreakdown = changeTypes;

    return summary;
  }

  /**
   * Generate JSON report
   */
  generateJSONReport(data, reportId) {
    return {
      reportId,
      generatedAt: new Date().toISOString(),
      summary: data.summary,
      activities: data.activities.map(a => ({
        ...a,
        metadata: JSON.parse(a.metadata || '{}'),
        tags: JSON.parse(a.tags || '[]')
      })),
      changes: data.changes.map(c => ({
        ...c,
        metadata: JSON.parse(c.metadata || '{}')
      })),
      agents: data.agents,
      tasks: data.tasks,
      metrics: data.metrics
    };
  }

  /**
   * Generate Markdown report
   */
  generateMarkdownReport(data, reportId) {
    const summary = data.summary;
    
    let markdown = `# Agent Activity Report\n\n`;
    markdown += `**Report ID:** ${reportId}\n`;
    markdown += `**Generated:** ${new Date().toISOString()}\n`;
    markdown += `**Period:** ${summary.period}\n\n`;

    // Summary section
    markdown += `## Summary\n\n`;
    markdown += `${summary.overview}\n\n`;
    
    markdown += `### Impact Breakdown\n`;
    for (const [level, count] of Object.entries(summary.impactBreakdown)) {
      markdown += `- **${level}**: ${count} changes\n`;
    }
    markdown += `\n`;

    // Active Agents
    if (data.agents.length > 0) {
      markdown += `## Active Agents\n\n`;
      markdown += `| Agent ID | Activities | First Activity | Last Activity |\n`;
      markdown += `|----------|------------|-----------------|----------------|\n`;
      
      for (const agent of data.agents.slice(0, 10)) {
        markdown += `| ${agent.agent_id} | ${agent.activity_count} | ${agent.first_activity} | ${agent.last_activity} |\n`;
      }
      markdown += `\n`;
    }

    // Recent Changes
    if (data.changes.length > 0) {
      markdown += `## Recent Changes\n\n`;
      markdown += `| File | Type | Impact | Agent | Timestamp |\n`;
      markdown += `|------|------|--------|-------|----------|\n`;
      
      for (const change of data.changes.slice(0, 20)) {
        markdown += `| ${change.file_path} | ${change.change_type} | ${change.impact_level} | ${change.agent_id || 'N/A'} | ${change.timestamp} |\n`;
      }
      markdown += `\n`;
    }

    // Task Progress
    if (data.tasks.length > 0) {
      markdown += `## Task Progress\n\n`;
      markdown += `| Task | Status | Progress | Assigned Agent |\n`;
      markdown += `|------|---------|----------|----------------|\n`;
      
      for (const task of data.tasks.slice(0, 10)) {
        markdown += `| ${task.description} | ${task.status} | ${task.progress}% | ${task.assigned_agent || 'Unassigned'} |\n`;
      }
      markdown += `\n`;
    }

    // Metrics Summary
    if (Object.keys(data.metrics).length > 0) {
      markdown += `## Metrics Summary\n\n`;
      for (const [metricType, metrics] of Object.entries(data.metrics)) {
        markdown += `### ${metricType}\n`;
        for (const metric of metrics.slice(0, 5)) {
          markdown += `- **${metric.agent_id}**: ${metric.avg_value.toFixed(3)} (avg), ${metric.max_value.toFixed(3)} (max)\n`;
        }
        markdown += `\n`;
      }
    }

    return markdown;
  }

  /**
   * Generate HTML report
   */
  generateHTMLReport(data, reportId) {
    const summary = data.summary;
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Activity Report - ${reportId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .summary-box { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f2f2f2; }
        .high { color: #d32f2f; font-weight: bold; }
        .medium { color: #f57c00; }
        .low { color: #388e3c; }
        .critical { color: #b71c1c; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Agent Activity Report</h1>
        <p><strong>Report ID:</strong> ${reportId}</p>
        <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
        <p><strong>Period:</strong> ${summary.period}</p>
    </div>

    <div class="summary-box">
        <h2>Summary</h2>
        <p>${summary.overview}</p>
        
        <h3>Impact Distribution</h3>
        <ul>`;

    for (const [level, count] of Object.entries(summary.impactBreakdown)) {
      html += `<li class="${level}"><strong>${level}:</strong> ${count} changes</li>`;
    }

    html += `</ul>
    </div>`;

    // Active Agents Table
    if (data.agents.length > 0) {
      html += `
    <h2>Active Agents</h2>
    <table>
        <thead>
            <tr>
                <th>Agent ID</th>
                <th>Activities</th>
                <th>First Activity</th>
                <th>Last Activity</th>
            </tr>
        </thead>
        <tbody>`;
      
      for (const agent of data.agents.slice(0, 10)) {
        html += `
            <tr>
                <td>${agent.agent_id}</td>
                <td>${agent.activity_count}</td>
                <td>${agent.first_activity}</td>
                <td>${agent.last_activity}</td>
            </tr>`;
      }
      
      html += `
        </tbody>
    </table>`;
    }

    // Recent Changes Table
    if (data.changes.length > 0) {
      html += `
    <h2>Recent Changes</h2>
    <table>
        <thead>
            <tr>
                <th>File</th>
                <th>Type</th>
                <th>Impact</th>
                <th>Agent</th>
                <th>Timestamp</th>
            </tr>
        </thead>
        <tbody>`;
      
      for (const change of data.changes.slice(0, 20)) {
        html += `
            <tr>
                <td>${change.file_path}</td>
                <td>${change.change_type}</td>
                <td class="${change.impact_level}">${change.impact_level}</td>
                <td>${change.agent_id || 'N/A'}</td>
                <td>${change.timestamp}</td>
            </tr>`;
      }
      
      html += `
        </tbody>
    </table>`;
    }

    html += `
</body>
</html>`;

    return html;
  }

  /**
   * Generate PDF report (placeholder - would need PDF library)
   */
  async generatePDFReport(data, reportId) {
    // This would require a PDF generation library like puppeteer or jsPDF
    // For now, return the HTML content that could be converted to PDF
    const htmlContent = this.generateHTMLReport(data, reportId);
    
    return {
      type: 'html-for-pdf',
      content: htmlContent,
      note: 'PDF generation requires additional setup with puppeteer or similar'
    };
  }

  /**
   * Save report to file
   */
  async saveReport(reportId, format, content, projectPath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `report-${reportId}-${timestamp}.${format}`;
    
    // Determine save path
    const reportsDir = projectPath 
      ? path.join(projectPath, '.claude-reports')
      : path.join(process.cwd(), '.claude-reports');
    
    await fs.ensureDir(reportsDir);
    const filePath = path.join(reportsDir, filename);

    // Save content
    if (format === 'json') {
      await fs.writeJSON(filePath, content, { spaces: 2 });
    } else {
      const fileContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      await fs.writeFile(filePath, fileContent, 'utf-8');
    }

    return filePath;
  }

  /**
   * Get latest reports
   */
  async getLatestReports(limit = 10) {
    const reports = await this.db.query(`
      SELECT * FROM generated_reports 
      ORDER BY created_at DESC 
      LIMIT ?
    `, [limit]);

    return reports.map(report => ({
      ...report,
      metadata: JSON.parse(report.metadata || '{}')
    }));
  }

  /**
   * Get report by ID
   */
  async getReportById(reportId) {
    const [report] = await this.db.query(`
      SELECT * FROM generated_reports 
      WHERE id = ?
    `, [reportId]);

    if (!report) {
      throw new Error(`Report not found: ${reportId}`);
    }

    // Load report content
    let content = null;
    if (report.file_path && await fs.pathExists(report.file_path)) {
      if (report.format === 'json') {
        content = await fs.readJSON(report.file_path);
      } else {
        content = await fs.readFile(report.file_path, 'utf-8');
      }
    }

    return {
      ...report,
      metadata: JSON.parse(report.metadata || '{}'),
      content
    };
  }

  /**
   * Create report template
   */
  async createReportTemplate(templateData) {
    const {
      name,
      description,
      templateContent,
      format,
      variables = []
    } = templateData;

    const templateId = uuid();
    
    await this.db.query(`
      INSERT INTO report_templates 
      (id, name, description, template_content, format, variables)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      templateId,
      name,
      description,
      templateContent,
      format,
      JSON.stringify(variables)
    ]);

    logger.info(`Report template created: ${name} (${templateId})`);
    
    return {
      id: templateId,
      name,
      description,
      format,
      variables
    };
  }

  /**
   * Generate report from template
   */
  async generateReportFromTemplate(templateId, data, variables = {}) {
    const [template] = await this.db.query(`
      SELECT * FROM report_templates 
      WHERE id = ?
    `, [templateId]);

    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Replace variables in template
    let content = template.template_content;
    const templateVars = JSON.parse(template.variables || '[]');
    
    for (const varName of templateVars) {
      if (variables[varName] !== undefined) {
        const placeholder = new RegExp(`{{${varName}}}`, 'g');
        content = content.replace(placeholder, variables[varName]);
      }
    }

    // Replace data placeholders
    content = this.replaceDataPlaceholders(content, data);

    return {
      templateId,
      content,
      format: template.format,
      name: template.name
    };
  }

  /**
   * Replace data placeholders in template
   */
  replaceDataPlaceholders(content, data) {
    // Simple placeholder replacement for common data fields
    const placeholders = {
      '{{summary.totalActivities}}': data.summary?.totalActivities || 0,
      '{{summary.totalChanges}}': data.summary?.totalChanges || 0,
      '{{summary.activeAgents}}': data.summary?.activeAgents?.length || 0,
      '{{summary.period}}': data.summary?.period || '',
      '{{generatedAt}}': new Date().toISOString()
    };

    let result = content;
    for (const [placeholder, value] of Object.entries(placeholders)) {
      result = result.replace(new RegExp(placeholder, 'g'), value);
    }

    return result;
  }
}