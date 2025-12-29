#!/usr/bin/env node
/**
 * Hivemind Intelligence Coordinator
 * Orchestrates all monitoring agents and provides unified intelligence
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { logger } = require('./utils/logger');

class HivemindCoordinator {
  constructor() {
    this.agents = {
      monitor: null,
      validator: null
    };
    this.status = {
      deploymentLive: false,
      lastCheck: null,
      totalChecks: 0,
      errors: []
    };
    this.logFile = path.join(__dirname, '../logs/hivemind.log');
    this.initializeLogging();
  }

  initializeLogging() {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [HIVEMIND] [${level}] ${message}\n`;
    logger.info(`🧠 ${message}`);
    fs.appendFileSync(this.logFile, logEntry);
  }

  startMonitoringAgent() {
    this.log('🚀 Deploying Content Analysis Agent');
    
    const monitorScript = path.join(__dirname, 'warehouse-monitor.js');
    this.agents.monitor = spawn('node', [monitorScript], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.agents.monitor.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        logger.info(`📡 MONITOR: ${output}`);
        
        // Check for deployment completion signal
        if (output.includes('DEPLOYMENT COMPLETE')) {
          this.status.deploymentLive = true;
          this.triggerPersonaValidation();
        }
      }
    });

    this.agents.monitor.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error) {
        this.log(`❌ Monitor error: ${error}`, 'ERROR');
        this.status.errors.push({
          agent: 'monitor',
          error,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.agents.monitor.on('close', (code) => {
      if (code === 0) {
        this.log('✅ Monitoring agent completed successfully');
      } else {
        this.log(`❌ Monitoring agent exited with code ${code}`, 'ERROR');
      }
      this.checkCompletion();
    });
  }

  triggerPersonaValidation() {
    this.log('🎭 Deploying Persona Validation Agent');
    
    const validatorScript = path.join(__dirname, 'persona-validator.js');
    this.agents.validator = spawn('node', [validatorScript], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.agents.validator.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        logger.info(`👥 VALIDATOR: ${output}`);
      }
    });

    this.agents.validator.stderr.on('data', (data) => {
      const error = data.toString().trim();
      if (error) {
        this.log(`❌ Validator error: ${error}`, 'ERROR');
        this.status.errors.push({
          agent: 'validator',
          error,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.agents.validator.on('close', (code) => {
      if (code === 0) {
        this.log('✅ Persona validation completed successfully');
      } else {
        this.log(`❌ Persona validation exited with code ${code}`, 'ERROR');
      }
      this.checkCompletion();
    });
  }

  checkCompletion() {
    const monitorDone = !this.agents.monitor || this.agents.monitor.exitCode !== null;
    const validatorDone = !this.agents.validator || this.agents.validator.exitCode !== null;

    if (monitorDone && (validatorDone || !this.status.deploymentLive)) {
      this.generateFinalReport();
    }
  }

  generateFinalReport() {
    this.log('📋 Generating final hivemind intelligence report');

    const reportsDir = path.join(__dirname, '../reports');
    const reports = {
      deployment: null,
      personas: null
    };

    // Load deployment report if exists
    const deploymentReportPath = path.join(reportsDir, 'deployment-report.json');
    if (fs.existsSync(deploymentReportPath)) {
      reports.deployment = JSON.parse(fs.readFileSync(deploymentReportPath, 'utf8'));
    }

    // Load persona report if exists
    const personaReportPath = path.join(reportsDir, 'persona-validation.json');
    if (fs.existsSync(personaReportPath)) {
      reports.personas = JSON.parse(fs.readFileSync(personaReportPath, 'utf8'));
    }

    const finalReport = {
      hivemind: {
        mission: 'Warehouse Platform Deployment Intelligence',
        status: this.status.deploymentLive ? 'SUCCESS' : 'IN_PROGRESS',
        timestamp: new Date().toISOString(),
        errors: this.status.errors
      },
      deployment: reports.deployment,
      personas: reports.personas,
      summary: {
        deploymentComplete: this.status.deploymentLive,
        totalErrors: this.status.errors.length,
        nextSteps: this.status.deploymentLive 
          ? ['Platform is live', 'Begin user acceptance testing', 'Monitor production metrics']
          : ['Continue monitoring deployment', 'Check Cloud Build status', 'Review deployment logs']
      }
    };

    const finalReportPath = path.join(reportsDir, 'hivemind-intelligence.json');
    fs.writeFileSync(finalReportPath, JSON.stringify(finalReport, null, 2));

    logger.info('\n🧠 ===== HIVEMIND INTELLIGENCE REPORT ===== 🧠');
    logger.info(`📊 Mission Status: ${finalReport.hivemind.status}`);
    logger.info(`🎯 Deployment Live: ${this.status.deploymentLive ? 'YES ✅' : 'NO ❌'}`);
    logger.info(`❌ Total Errors: ${this.status.errors.length}`);
    logger.info(`📄 Full Report: ${finalReportPath}`);
    logger.info('🧠 ======================================= 🧠\n');

    if (this.status.deploymentLive) {
      logger.info('🎉 MISSION ACCOMPLISHED! Warehouse platform is operational! 🎉');
    } else {
      logger.info('⏳ Mission continues... Monitoring deployment progress...');
    }
  }

  start() {
    this.log('🧠 HIVEMIND INTELLIGENCE SYSTEM ACTIVATED');
    this.log('🎯 Mission: Monitor warehouse platform deployment');
    this.log('📡 Target: https://warehouse-frontend-467296114824.us-central1.run.app/');
    this.log('🚀 Deploying monitoring agents...');

    // Start the primary monitoring agent
    this.startMonitoringAgent();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      this.log('📴 Hivemind shutdown initiated');
      if (this.agents.monitor) this.agents.monitor.kill();
      if (this.agents.validator) this.agents.validator.kill();
      this.generateFinalReport();
      process.exit(0);
    });
  }
}

// Start the hivemind
const coordinator = new HivemindCoordinator();
coordinator.start();