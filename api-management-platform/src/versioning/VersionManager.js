const semver = require('semver');
const logger = require('../shared/utils/logger');
const { ValidationError, ConflictError, NotFoundError } = require('../shared/middleware/errorHandler');

class VersionManager {
  constructor() {
    this.supportedVersioningStrategies = {
      'semantic': this.handleSemanticVersioning.bind(this),
      'date': this.handleDateVersioning.bind(this),
      'sequential': this.handleSequentialVersioning.bind(this),
      'hybrid': this.handleHybridVersioning.bind(this)
    };

    this.versioningPolicies = {
      'strict': {
        allowBreakingChanges: false,
        requireMigrationGuide: true,
        deprecationPeriod: 90 // days
      },
      'relaxed': {
        allowBreakingChanges: true,
        requireMigrationGuide: false,
        deprecationPeriod: 30 // days
      },
      'agile': {
        allowBreakingChanges: true,
        requireMigrationGuide: true,
        deprecationPeriod: 60 // days
      }
    };
  }

  /**
   * Create a new API version
   */
  async createVersion(apiId, versionData, options = {}) {
    try {
      const {
        version,
        changelog = '',
        schema = {},
        strategy = 'semantic',
        policy = 'strict',
        sourceVersion = null,
        autoMigrate = false
      } = versionData;

      // Validate version format based on strategy
      const validatedVersion = await this.validateVersion(version, strategy, apiId);

      // Get existing versions for comparison
      const existingVersions = await this.getVersions(apiId);

      // Check for version conflicts
      await this.checkVersionConflicts(validatedVersion, existingVersions);

      // Analyze changes if source version provided
      let changeAnalysis = null;
      if (sourceVersion) {
        changeAnalysis = await this.analyzeChanges(apiId, sourceVersion, schema);

        // Apply versioning policy
        await this.applyVersioningPolicy(changeAnalysis, policy);
      }

      // Create version record
      const newVersion = {
        id: this.generateVersionId(),
        version: validatedVersion,
        apiId,
        changelog,
        schema,
        status: 'draft',
        strategy,
        policy,
        sourceVersion,
        changeAnalysis,
        metadata: {
          createdAt: new Date(),
          createdBy: options.userId,
          tags: options.tags || [],
          environment: options.environment || 'development'
        }
      };

      // Auto-migrate if requested and safe
      if (autoMigrate && changeAnalysis && changeAnalysis.compatibility.level === 'compatible') {
        newVersion.migrationPath = await this.generateMigrationPath(
          apiId,
          sourceVersion,
          validatedVersion,
          changeAnalysis
        );
      }

      logger.info('API version created', {
        apiId,
        version: validatedVersion,
        sourceVersion,
        strategy,
        policy,
        userId: options.userId
      });

      return newVersion;

    } catch (error) {
      logger.error('Error creating API version:', error);
      throw error;
    }
  }

  /**
   * Validate version based on strategy
   */
  async validateVersion(version, strategy, apiId) {
    const handler = this.supportedVersioningStrategies[strategy];

    if (!handler) {
      throw new ValidationError(\`Unsupported versioning strategy: \${strategy}\`);
    }

    return handler(version, apiId);
  }

  /**
   * Handle semantic versioning (X.Y.Z)
   */
  handleSemanticVersioning(version, apiId) {
    if (!semver.valid(version)) {
      throw new ValidationError('Invalid semantic version format. Use X.Y.Z format.');
    }

    return semver.clean(version);
  }

  /**
   * Handle date-based versioning (YYYY-MM-DD)
   */
  handleDateVersioning(version, apiId) {
    const dateRegex = /^\\d{4}-\\d{2}-\\d{2}$/;

    if (!dateRegex.test(version)) {
      throw new ValidationError('Invalid date version format. Use YYYY-MM-DD format.');
    }

    const date = new Date(version + 'T00:00:00.000Z');
    if (isNaN(date.getTime())) {
      throw new ValidationError('Invalid date in version.');
    }

    return version;
  }

  /**
   * Handle sequential versioning (v1, v2, v3)
   */
  handleSequentialVersioning(version, apiId) {
    const sequentialRegex = /^v\\d+$/;

    if (!sequentialRegex.test(version)) {
      throw new ValidationError('Invalid sequential version format. Use v1, v2, v3, etc.');
    }

    return version;
  }

  /**
   * Handle hybrid versioning (v1.2023-01-15)
   */
  handleHybridVersioning(version, apiId) {
    const hybridRegex = /^v\\d+\\.\\d{4}-\\d{2}-\\d{2}$/;

    if (!hybridRegex.test(version)) {
      throw new ValidationError('Invalid hybrid version format. Use vX.YYYY-MM-DD format.');
    }

    // Validate date part
    const datePart = version.split('.')[1];
    const date = new Date(datePart + 'T00:00:00.000Z');
    if (isNaN(date.getTime())) {
      throw new ValidationError('Invalid date in hybrid version.');
    }

    return version;
  }

  /**
   * Analyze changes between versions
   */
  async analyzeChanges(apiId, sourceVersion, targetSchema) {
    try {
      // Get source schema
      const sourceSchema = await this.getVersionSchema(apiId, sourceVersion);

      // Perform deep comparison
      const changes = {
        added: this.findAddedElements(sourceSchema, targetSchema),
        removed: this.findRemovedElements(sourceSchema, targetSchema),
        modified: this.findModifiedElements(sourceSchema, targetSchema),
        endpoints: this.analyzeEndpointChanges(sourceSchema, targetSchema),
        models: this.analyzeModelChanges(sourceSchema, targetSchema)
      };

      // Determine compatibility level
      const compatibility = this.assessCompatibility(changes);

      // Generate migration recommendations
      const recommendations = this.generateMigrationRecommendations(changes, compatibility);

      return {
        sourceVersion,
        targetVersion: 'pending',
        changes,
        compatibility,
        recommendations,
        analyzedAt: new Date()
      };

    } catch (error) {
      logger.error('Error analyzing version changes:', error);
      throw error;
    }
  }

  /**
   * Assess compatibility between versions
   */
  assessCompatibility(changes) {
    let level = 'compatible';
    let issues = [];
    let warnings = [];

    // Check for breaking changes
    if (changes.removed.endpoints.length > 0) {
      level = 'breaking';
      issues.push('Endpoints have been removed');
    }

    if (changes.removed.models.length > 0) {
      level = 'breaking';
      issues.push('Models have been removed');
    }

    // Check for potentially breaking modifications
    changes.modified.endpoints.forEach(endpoint => {
      if (endpoint.changes.includes('required_parameter_added')) {
        level = level === 'compatible' ? 'breaking' : level;
        issues.push(\`Required parameter added to \${endpoint.path}\`);
      }
      if (endpoint.changes.includes('response_format_changed')) {
        level = level === 'compatible' ? 'potentially-breaking' : level;
        warnings.push(\`Response format changed for \${endpoint.path}\`);
      }
    });

    changes.modified.models.forEach(model => {
      if (model.changes.includes('required_field_added')) {
        level = level === 'compatible' ? 'breaking' : level;
        issues.push(\`Required field added to model \${model.name}\`);
      }
      if (model.changes.includes('field_type_changed')) {
        level = level === 'compatible' ? 'potentially-breaking' : level;
        warnings.push(\`Field type changed in model \${model.name}\`);
      }
    });

    return {
      level,
      issues,
      warnings,
      score: this.calculateCompatibilityScore(changes)
    };
  }

  /**
   * Calculate compatibility score (0-100)
   */
  calculateCompatibilityScore(changes) {
    let score = 100;

    // Deduct points for breaking changes
    score -= changes.removed.endpoints.length * 20;
    score -= changes.removed.models.length * 15;
    score -= changes.modified.endpoints.length * 5;
    score -= changes.modified.models.length * 5;

    // Deduct points for added elements (might break clients)
    score -= changes.added.endpoints.length * 1;
    score -= changes.added.models.length * 1;

    return Math.max(0, score);
  }

  /**
   * Apply versioning policy rules
   */
  async applyVersioningPolicy(changeAnalysis, policy) {
    const policyRules = this.versioningPolicies[policy];

    if (!policyRules) {
      throw new ValidationError(\`Unknown versioning policy: \${policy}\`);
    }

    // Check if breaking changes are allowed
    if (changeAnalysis.compatibility.level === 'breaking' && !policyRules.allowBreakingChanges) {
      throw new ValidationError(
        'Breaking changes are not allowed under the current versioning policy. ' +
        'Consider using a relaxed policy or increment major version.'
      );
    }

    // Check if migration guide is required
    if (changeAnalysis.compatibility.level !== 'compatible' && policyRules.requireMigrationGuide) {
      if (!changeAnalysis.recommendations.migrationGuide) {
        logger.warn('Migration guide recommended for this version change');
      }
    }
  }

  /**
   * Generate migration path between versions
   */
  async generateMigrationPath(apiId, sourceVersion, targetVersion, changeAnalysis) {
    try {
      const migrationSteps = [];

      // Generate steps for endpoint changes
      changeAnalysis.changes.modified.endpoints.forEach(endpoint => {
        if (endpoint.changes.includes('parameter_added')) {
          migrationSteps.push({
            type: 'endpoint_parameter',
            action: 'update_client',
            endpoint: endpoint.path,
            description: \`Add new parameter to \${endpoint.path}\`,
            impact: 'low'
          });
        }
      });

      // Generate steps for model changes
      changeAnalysis.changes.modified.models.forEach(model => {
        if (model.changes.includes('field_added')) {
          migrationSteps.push({
            type: 'model_field',
            action: 'update_schema',
            model: model.name,
            description: \`Handle new field in \${model.name} model\`,
            impact: 'medium'
          });
        }
      });

      // Generate rollback plan
      const rollbackSteps = migrationSteps.map(step => ({
        ...step,
        action: this.getReverseMigrationAction(step.action),
        description: \`Rollback: \${step.description}\`
      })).reverse();

      return {
        sourceVersion,
        targetVersion,
        steps: migrationSteps,
        rollbackSteps,
        estimatedTime: this.estimateMigrationTime(migrationSteps),
        riskLevel: this.assessMigrationRisk(migrationSteps),
        createdAt: new Date()
      };

    } catch (error) {
      logger.error('Error generating migration path:', error);
      throw error;
    }
  }

  /**
   * Publish a version
   */
  async publishVersion(apiId, version, options = {}) {
    try {
      const versionRecord = await this.getVersion(apiId, version);

      if (!versionRecord) {
        throw new NotFoundError(\`Version \${version} not found for API \${apiId}\`);
      }

      if (versionRecord.status === 'published') {
        throw new ConflictError('Version is already published');
      }

      // Validate version is ready for publishing
      await this.validateVersionForPublishing(versionRecord);

      // Update version status
      versionRecord.status = 'published';
      versionRecord.metadata.publishedAt = new Date();
      versionRecord.metadata.publishedBy = options.userId;

      // Handle deprecation of previous versions if requested
      if (options.deprecatePrevious) {
        await this.deprecatePreviousVersions(apiId, version);
      }

      logger.info('API version published', {
        apiId,
        version,
        userId: options.userId,
        deprecatePrevious: options.deprecatePrevious
      });

      return versionRecord;

    } catch (error) {
      logger.error('Error publishing version:', error);
      throw error;
    }
  }

  /**
   * Deprecate a version
   */
  async deprecateVersion(apiId, version, options = {}) {
    try {
      const versionRecord = await this.getVersion(apiId, version);

      if (!versionRecord) {
        throw new NotFoundError(\`Version \${version} not found for API \${apiId}\`);
      }

      const deprecationDate = new Date();
      const sunsetDate = options.sunsetDate ||
        new Date(deprecationDate.getTime() + (90 * 24 * 60 * 60 * 1000)); // 90 days

      versionRecord.status = 'deprecated';
      versionRecord.deprecation = {
        deprecatedAt: deprecationDate,
        deprecatedBy: options.userId,
        reason: options.reason || 'Version deprecated',
        sunsetDate,
        replacementVersion: options.replacementVersion
      };

      logger.info('API version deprecated', {
        apiId,
        version,
        sunsetDate,
        replacementVersion: options.replacementVersion,
        userId: options.userId
      });

      return versionRecord;

    } catch (error) {
      logger.error('Error deprecating version:', error);
      throw error;
    }
  }

  /**
   * Get version compatibility matrix
   */
  async getCompatibilityMatrix(apiId) {
    try {
      const versions = await this.getVersions(apiId);
      const matrix = {};

      for (let i = 0; i < versions.length; i++) {
        for (let j = i + 1; j < versions.length; j++) {
          const sourceVersion = versions[i].version;
          const targetVersion = versions[j].version;

          const compatibility = await this.checkVersionCompatibility(
            apiId,
            sourceVersion,
            targetVersion
          );

          matrix[\`\${sourceVersion}->\${targetVersion}\`] = compatibility;
        }
      }

      return {
        apiId,
        versions: versions.map(v => v.version),
        matrix,
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error('Error generating compatibility matrix:', error);
      throw error;
    }
  }

  /**
   * Helper methods (placeholder implementations)
   */
  generateVersionId() {
    return 'ver_' + Math.random().toString(36).substr(2, 9);
  }

  async getVersions(apiId) {
    // Placeholder - implement database query
    return [];
  }

  async getVersion(apiId, version) {
    // Placeholder - implement database query
    return null;
  }

  async getVersionSchema(apiId, version) {
    // Placeholder - implement database query
    return {};
  }

  async checkVersionConflicts(version, existingVersions) {
    const conflict = existingVersions.find(v => v.version === version);
    if (conflict) {
      throw new ConflictError(\`Version \${version} already exists\`);
    }
  }

  findAddedElements(source, target) {
    // Placeholder - implement deep schema comparison
    return { endpoints: [], models: [], properties: [] };
  }

  findRemovedElements(source, target) {
    // Placeholder - implement deep schema comparison
    return { endpoints: [], models: [], properties: [] };
  }

  findModifiedElements(source, target) {
    // Placeholder - implement deep schema comparison
    return { endpoints: [], models: [], properties: [] };
  }

  analyzeEndpointChanges(source, target) {
    // Placeholder - implement endpoint comparison
    return [];
  }

  analyzeModelChanges(source, target) {
    // Placeholder - implement model comparison
    return [];
  }

  generateMigrationRecommendations(changes, compatibility) {
    // Placeholder - implement recommendation engine
    return {
      immediate: [],
      suggested: [],
      migrationGuide: null
    };
  }

  async validateVersionForPublishing(versionRecord) {
    // Placeholder - implement publishing validation
    if (!versionRecord.schema || Object.keys(versionRecord.schema).length === 0) {
      throw new ValidationError('Version schema is required for publishing');
    }
  }

  async deprecatePreviousVersions(apiId, currentVersion) {
    // Placeholder - implement previous version deprecation
    logger.info(\`Deprecating previous versions for API \${apiId}\`);
  }

  async checkVersionCompatibility(apiId, sourceVersion, targetVersion) {
    // Placeholder - implement compatibility check
    return { level: 'compatible', score: 100 };
  }

  getReverseMigrationAction(action) {
    const reverseMap = {
      'update_client': 'revert_client',
      'update_schema': 'revert_schema',
      'add_parameter': 'remove_parameter'
    };
    return reverseMap[action] || 'manual_revert';
  }

  estimateMigrationTime(steps) {
    return steps.length * 30; // 30 minutes per step (rough estimate)
  }

  assessMigrationRisk(steps) {
    const highRiskActions = steps.filter(s => s.impact === 'high').length;
    const mediumRiskActions = steps.filter(s => s.impact === 'medium').length;

    if (highRiskActions > 0) return 'high';
    if (mediumRiskActions > 2) return 'medium';
    return 'low';
  }
}

module.exports = VersionManager;