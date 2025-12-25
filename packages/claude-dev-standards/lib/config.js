const { cosmiconfig } = require('cosmiconfig');
const fs = require('fs-extra');
const path = require('path');
const Joi = require('joi');
const _ = require('lodash');

const configSchema = Joi.object({
  extends: Joi.string(),
  projectType: Joi.string().valid('auto', 'node', 'python', 'go', 'java', 'ruby', 'php', 'rust', 'dotnet'),
  checks: Joi.object({
    noMocks: Joi.boolean(),
    realDatabase: Joi.boolean(),
    authentication: Joi.boolean(),
    errorHandling: Joi.boolean(),
    logging: Joi.boolean(),
    testing: Joi.boolean(),
    docker: Joi.boolean(),
    ci: Joi.boolean(),
    security: Joi.boolean(),
    monitoring: Joi.boolean()
  }),
  custom: Joi.object({
    minTestCoverage: Joi.number().min(0).max(100),
    requiredEnvVars: Joi.array().items(Joi.string()),
    forbiddenPatterns: Joi.array().items(Joi.string()),
    requiredFiles: Joi.array().items(Joi.string()),
    databases: Joi.array().items(Joi.string()),
    security: Joi.object()
  }),
  hooks: Joi.object({
    preCommit: Joi.array().items(Joi.string()),
    prePush: Joi.array().items(Joi.string()),
    postInstall: Joi.array().items(Joi.string())
  }),
  validators: Joi.object()
});

const defaultConfig = {
  projectType: 'auto',
  checks: {
    noMocks: true,
    realDatabase: true,
    authentication: true,
    errorHandling: true,
    logging: true,
    testing: true,
    docker: true,
    ci: true,
    security: true,
    monitoring: true
  },
  custom: {
    minTestCoverage: 80,
    requiredEnvVars: ['NODE_ENV'],
    forbiddenPatterns: [],
    requiredFiles: [],
    databases: []
  }
};

async function load(projectPath) {
  const explorer = cosmiconfig('claude-standards', {
    searchPlaces: [
      '.claude-standards.json',
      '.claude-standards.js',
      '.claude-standards.yaml',
      '.claude-standards.yml',
      'claude-standards.config.js',
      'package.json'
    ]
  });
  
  try {
    const result = await explorer.search(projectPath);
    
    if (!result || !result.config) {
      // No config found, return defaults
      return defaultConfig;
    }
    
    // Validate config
    const { error, value } = configSchema.validate(result.config);
    if (error) {
      throw new Error(`Invalid configuration: ${error.message}`);
    }
    
    // Handle extends
    let finalConfig = value;
    if (value.extends) {
      const baseConfig = await loadExtends(value.extends, projectPath);
      finalConfig = _.merge({}, defaultConfig, baseConfig, value);
      delete finalConfig.extends;
    } else {
      finalConfig = _.merge({}, defaultConfig, value);
    }
    
    return finalConfig;
    
  } catch (error) {
    throw new Error(`Failed to load configuration: ${error.message}`);
  }
}

async function loadExtends(extendsPath, projectPath) {
  if (extendsPath === 'claude-dev-standards/recommended') {
    return require('./standards/recommended');
  }
  
  // Handle relative paths
  const configPath = path.resolve(projectPath, extendsPath);
  
  if (await fs.exists(configPath)) {
    return require(configPath);
  }
  
  // Try to load from node_modules
  try {
    return require(extendsPath);
  } catch (error) {
    throw new Error(`Cannot load extended configuration: ${extendsPath}`);
  }
}

async function create(projectPath, config) {
  const configPath = path.join(projectPath, '.claude-standards.json');
  
  // Validate config
  const { error, value } = configSchema.validate(config);
  if (error) {
    throw new Error(`Invalid configuration: ${error.message}`);
  }
  
  // Write config
  await fs.writeJSON(configPath, value, { spaces: 2 });
  
  return configPath;
}

module.exports = {
  load,
  create,
  defaultConfig,
  configSchema
};