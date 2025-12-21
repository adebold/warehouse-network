#!/usr/bin/env node
/**
 * Persona Journey Validation System
 * Tests all user journeys when deployment goes live
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://warehouse-frontend-467296114824.us-central1.run.app';

class PersonaValidator {
  constructor() {
    this.personas = {
      visitor: {
        name: 'Anonymous Visitor',
        journeys: [
          { path: '/', description: 'Homepage browsing' },
          { path: '/search', description: 'Search warehouses' },
          { path: '/listings', description: 'Browse listings' }
        ]
      },
      business: {
        name: 'Business Owner',
        journeys: [
          { path: '/login', description: 'Business login' },
          { path: '/dashboard', description: 'Business dashboard' },
          { path: '/search', description: 'Find warehouse space' },
          { path: '/booking', description: 'Book warehouse' }
        ]
      },
      property: {
        name: 'Property Owner', 
        journeys: [
          { path: '/login', description: 'Property owner login' },
          { path: '/admin/dashboard', description: 'Property management' },
          { path: '/admin/listings', description: 'Manage listings' },
          { path: '/admin/bookings', description: 'View bookings' }
        ]
      }
    };
    this.results = {};
  }

  async makeRequest(url, timeout = 10000) {
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

  async validatePersonaJourney(personaKey, persona) {
    console.log(`\n👤 Validating ${persona.name} journey...`);
    const journeyResults = [];

    for (const journey of persona.journeys) {
      const url = BASE_URL + journey.path;
      console.log(`  🔗 Testing: ${journey.description} (${journey.path})`);

      try {
        const response = await this.makeRequest(url);
        const isWorking = response.statusCode === 200 || response.statusCode === 302;
        
        journeyResults.push({
          path: journey.path,
          description: journey.description,
          status: response.statusCode,
          responseTime: response.responseTime,
          working: isWorking,
          timestamp: new Date().toISOString()
        });

        const status = isWorking ? '✅' : '❌';
        console.log(`    ${status} Status: ${response.statusCode}, Time: ${response.responseTime}ms`);

      } catch (error) {
        journeyResults.push({
          path: journey.path,
          description: journey.description,
          status: 'ERROR',
          error: error.message,
          working: false,
          timestamp: new Date().toISOString()
        });
        console.log(`    ❌ Error: ${error.message}`);
      }
    }

    return journeyResults;
  }

  async validateAllPersonas() {
    console.log('🚀 PERSONA VALIDATION INITIATED');
    console.log(`📡 Target: ${BASE_URL}`);

    for (const [personaKey, persona] of Object.entries(this.personas)) {
      this.results[personaKey] = await this.validatePersonaJourney(personaKey, persona);
    }

    return this.generateReport();
  }

  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      baseUrl: BASE_URL,
      summary: {
        totalPersonas: Object.keys(this.personas).length,
        totalJourneys: 0,
        workingJourneys: 0,
        failedJourneys: 0
      },
      personas: this.results
    };

    // Calculate summary statistics
    for (const personaResults of Object.values(this.results)) {
      report.summary.totalJourneys += personaResults.length;
      report.summary.workingJourneys += personaResults.filter(j => j.working).length;
      report.summary.failedJourneys += personaResults.filter(j => !j.working).length;
    }

    // Save report
    const reportFile = path.join(__dirname, '../reports/persona-validation.json');
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    console.log('\n📊 PERSONA VALIDATION REPORT');
    console.log(`✅ Working journeys: ${report.summary.workingJourneys}/${report.summary.totalJourneys}`);
    console.log(`❌ Failed journeys: ${report.summary.failedJourneys}/${report.summary.totalJourneys}`);
    console.log(`📄 Report saved: ${reportFile}`);

    return report;
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new PersonaValidator();
  validator.validateAllPersonas().catch(console.error);
}

module.exports = PersonaValidator;