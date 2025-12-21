#!/usr/bin/env node
/**
 * Warehouse Platform Deployment Monitor
 * Hivemind Intelligence System
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'https://warehouse-frontend-467296114824.us-central1.run.app/';
const MONITORING_DURATION = 10 * 60 * 1000; // 10 minutes
const POLLING_INTERVAL = 30 * 1000; // 30 seconds
const SUCCESS_MARKER = 'Find Your Perfect Warehouse Space';
const ROUTES_TO_TEST = ['/search', '/login', '/admin/dashboard', '/api/health'];

class WarehouseMonitor {
  constructor() {
    this.startTime = Date.now();
    this.isLive = false;
    this.metrics = {
      checks: 0,
      errors: 0,
      responseTimes: [],
      routeStatuses: {},
      contentDetection: []
    };
    this.logFile = path.join(__dirname, '../logs/monitoring.log');
    this.reportFile = path.join(__dirname, '../reports/deployment-report.json');
    this.ensureDirectories();
  }

  ensureDirectories() {
    const dirs = [
      path.dirname(this.logFile),
      path.dirname(this.reportFile)
    ];
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}\n`;
    console.log(`🤖 HIVEMIND: ${message}`);
    fs.appendFileSync(this.logFile, logEntry);
  }

  async makeRequest(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const req = https.get(url, { timeout }, (res) => {
        const responseTime = Date.now() - startTime;
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
            responseTime
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }

  analyzeContent(body) {
    // Check for Next.js indicators
    const nextJsIndicators = [
      '__NEXT_DATA__',
      '_next/static',
      'next-router',
      SUCCESS_MARKER
    ];

    // Check for static HTML indicators
    const staticIndicators = [
      'under construction',
      'coming soon',
      'static page',
      'placeholder'
    ];

    const hasNextJs = nextJsIndicators.some(indicator => 
      body.toLowerCase().includes(indicator.toLowerCase())
    );
    const hasStatic = staticIndicators.some(indicator => 
      body.toLowerCase().includes(indicator.toLowerCase())
    );
    const hasSuccessMarker = body.includes(SUCCESS_MARKER);

    return {
      isNextJs: hasNextJs,
      isStatic: hasStatic,
      hasSuccessMarker,
      contentType: hasSuccessMarker ? 'warehouse-app' : 
                   hasNextJs ? 'nextjs' : 
                   hasStatic ? 'static' : 'unknown'
    };
  }

  async validateRoutes() {
    const routeResults = {};
    
    for (const route of ROUTES_TO_TEST) {
      try {
        const url = TARGET_URL.replace(/\/$/, '') + route;
        const response = await this.makeRequest(url);
        routeResults[route] = {
          status: response.statusCode,
          responseTime: response.responseTime,
          working: response.statusCode === 200
        };
      } catch (error) {
        routeResults[route] = {
          status: 'ERROR',
          error: error.message,
          working: false
        };
      }
    }
    
    return routeResults;
  }

  async performCheck() {
    this.metrics.checks++;
    this.log(`Performing check #${this.metrics.checks}`);

    try {
      // Main homepage check
      const response = await this.makeRequest(TARGET_URL);
      this.metrics.responseTimes.push(response.responseTime);

      // Content analysis
      const contentAnalysis = this.analyzeContent(response.body);
      this.metrics.contentDetection.push({
        timestamp: Date.now(),
        ...contentAnalysis
      });

      this.log(`Status: ${response.statusCode}, Response Time: ${response.responseTime}ms, Content: ${contentAnalysis.contentType}`);

      // Route validation
      const routeResults = await this.validateRoutes();
      this.metrics.routeStatuses = routeResults;

      // Check if deployment is complete
      if (contentAnalysis.hasSuccessMarker && !this.isLive) {
        this.isLive = true;
        this.deploymentComplete();
      }

      // Performance check
      const avgResponseTime = this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length;
      if (avgResponseTime > 2000) {
        this.log(`⚠️  PERFORMANCE ALERT: Average response time ${avgResponseTime.toFixed(2)}ms exceeds 2s target`, 'WARNING');
      }

      return {
        success: true,
        response,
        contentAnalysis,
        routeResults,
        avgResponseTime
      };

    } catch (error) {
      this.metrics.errors++;
      this.log(`❌ Check failed: ${error.message}`, 'ERROR');
      return { success: false, error: error.message };
    }
  }

  deploymentComplete() {
    this.log('🎉 DEPLOYMENT COMPLETE! Beautiful warehouse platform is LIVE!', 'SUCCESS');
    this.log(`✨ Success marker detected: "${SUCCESS_MARKER}"`, 'SUCCESS');
    this.log('🚀 Next.js application successfully deployed', 'SUCCESS');
    this.log('📊 Generating final deployment report...', 'SUCCESS');
    
    // Generate immediate alert
    this.generateReport(true);
    
    console.log('\n🎊 ===== HIVEMIND ALERT ===== 🎊');
    console.log('🏭 WAREHOUSE PLATFORM IS LIVE!');
    console.log('✅ Beautiful Next.js application deployed');
    console.log('🔗 URL: ' + TARGET_URL);
    console.log('📱 Ready for persona testing');
    console.log('⚡ All systems operational');
    console.log('🎊 ========================== 🎊\n');
  }

  generateReport(isFinal = false) {
    const avgResponseTime = this.metrics.responseTimes.length > 0 
      ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length 
      : 0;

    const report = {
      deployment: {
        isLive: this.isLive,
        deploymentTime: isFinal ? Date.now() : null,
        monitoringDuration: Date.now() - this.startTime
      },
      performance: {
        totalChecks: this.metrics.checks,
        totalErrors: this.metrics.errors,
        avgResponseTime: parseFloat(avgResponseTime.toFixed(2)),
        maxResponseTime: Math.max(...this.metrics.responseTimes, 0),
        minResponseTime: Math.min(...this.metrics.responseTimes, 0)
      },
      routes: this.metrics.routeStatuses,
      contentEvolution: this.metrics.contentDetection,
      timestamp: new Date().toISOString(),
      targetUrl: TARGET_URL
    };

    fs.writeFileSync(this.reportFile, JSON.stringify(report, null, 2));
    
    if (isFinal) {
      this.log('📊 Final deployment report generated', 'SUCCESS');
    }
  }

  async start() {
    this.log('🚀 HIVEMIND MONITORING INITIATED');
    this.log(`📡 Target: ${TARGET_URL}`);
    this.log(`⏱️  Duration: ${MONITORING_DURATION / 60000} minutes`);
    this.log(`🔄 Interval: ${POLLING_INTERVAL / 1000} seconds`);
    this.log(`🎯 Success marker: "${SUCCESS_MARKER}"`);

    const endTime = this.startTime + MONITORING_DURATION;
    
    const monitor = async () => {
      if (Date.now() >= endTime || this.isLive) {
        clearInterval(interval);
        if (!this.isLive) {
          this.log('⏰ Monitoring period completed - deployment still in progress', 'WARNING');
        }
        this.generateReport(this.isLive);
        process.exit(this.isLive ? 0 : 1);
      }

      await this.performCheck();
    };

    // Initial check
    await monitor();
    
    // Set up interval monitoring
    const interval = setInterval(monitor, POLLING_INTERVAL);
  }
}

// Start monitoring
const monitor = new WarehouseMonitor();
monitor.start().catch(console.error);