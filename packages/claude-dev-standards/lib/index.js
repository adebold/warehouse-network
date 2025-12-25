// Main entry point for the claude-dev-standards package

const projectDetector = require('./utils/projectDetector');
const validator = require('./validator');
const fixer = require('./fixer');
const config = require('./config');
const standards = require('./standards');
const SecurityValidator = require('./validators/security');

module.exports = {
  // Core functionality
  detectProjectType: projectDetector.detect,
  validate: validator.validate,
  fix: fixer.fix,
  
  // Configuration
  loadConfig: config.load,
  createConfig: config.create,
  
  // Standards and rules
  standards: standards,
  
  // Security framework
  Security: SecurityValidator,
  setupSecurity: async (projectPath, options) => {
    const security = new SecurityValidator(options);
    return security.setupSecurity(projectPath, options);
  },
  validateSecurity: async (projectPath, options) => {
    const security = new SecurityValidator(options);
    return security.validate(projectPath);
  },
  
  // Utility exports
  utils: {
    projectDetector,
    validator,
    fixer,
    config,
    security: SecurityValidator
  }
};