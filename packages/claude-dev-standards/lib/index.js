// Main entry point for the claude-dev-standards package

const projectDetector = require('./utils/projectDetector');
const validator = require('./validator');
const fixer = require('./fixer');
const config = require('./config');
const standards = require('./standards');

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
  
  // Utility exports
  utils: {
    projectDetector,
    validator,
    fixer,
    config
  }
};