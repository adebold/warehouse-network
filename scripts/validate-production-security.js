#!/usr/bin/env node

/**
 * Production Security Validation Script for Skidspace
 * Validates all security enhancements after deployment
 */

const https = require('https');
const http = require('http');
const { performance } = require('perf_hooks');

class SecurityValidator {
    constructor(options = {}) {
        this.baseUrl = options.baseUrl || process.env.APP_URL || 'https://skidspace.com';
        this.timeout = options.timeout || 30000;
        this.verbose = options.verbose || false;
        this.results = {
            passed: 0,
            failed: 0,
            warnings: 0,
            tests: []
        };
    }

    log(message, level = 'info') {
        const timestamp = new Date().toISOString();
        const colors = {
            info: '\x1b[34m',
            success: '\x1b[32m',
            warning: '\x1b[33m',
            error: '\x1b[31m',
            reset: '\x1b[0m'
        };

        if (this.verbose || level !== 'info') {
            console.log(`${colors[level]}[${timestamp}] [${level.toUpperCase()}] ${message}${colors.reset}`);
        }
    }

    async makeRequest(path, options = {}) {
        const url = `${this.baseUrl}${path}`;
        const isHttps = url.startsWith('https');
        const client = isHttps ? https : http;

        return new Promise((resolve, reject) => {
            const req = client.request(url, {
                method: options.method || 'GET',
                timeout: this.timeout,
                headers: options.headers || {},
                ...options
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: data,
                        timing: performance.now()
                    });
                });
            });

            req.on('error', reject);
            req.on('timeout', () => reject(new Error('Request timeout')));

            if (options.body) {
                req.write(options.body);
            }

            req.end();
        });
    }

    addTestResult(name, passed, message, level = 'info') {
        const result = { name, passed, message, level };
        this.results.tests.push(result);

        if (passed) {
            this.results.passed++;
            this.log(`✅ ${name}: ${message}`, 'success');
        } else {
            if (level === 'warning') {
                this.results.warnings++;
                this.log(`⚠️  ${name}: ${message}`, 'warning');
            } else {
                this.results.failed++;
                this.log(`❌ ${name}: ${message}`, 'error');
            }
        }
    }

    async testApplicationHealth() {
        this.log('Testing application health...', 'info');

        try {
            const response = await this.makeRequest('/api/health');

            if (response.statusCode === 200) {
                this.addTestResult('Application Health', true, 'Health endpoint responding correctly');

                try {
                    const healthData = JSON.parse(response.body);
                    if (healthData.status === 'healthy') {
                        this.addTestResult('Health Status', true, 'Application reports healthy status');
                    } else {
                        this.addTestResult('Health Status', false, `Application reports status: ${healthData.status}`);
                    }
                } catch (e) {
                    this.addTestResult('Health Response Format', false, 'Health endpoint response is not valid JSON', 'warning');
                }
            } else {
                this.addTestResult('Application Health', false, `Health endpoint returned status ${response.statusCode}`);
            }
        } catch (error) {
            this.addTestResult('Application Health', false, `Health endpoint unreachable: ${error.message}`);
        }
    }

    async testSecurityHeaders() {
        this.log('Testing security headers...', 'info');

        try {
            const response = await this.makeRequest('/');

            const securityHeaders = {
                'strict-transport-security': 'HSTS protection',
                'x-content-type-options': 'MIME type sniffing protection',
                'x-frame-options': 'Clickjacking protection',
                'x-xss-protection': 'XSS protection',
                'content-security-policy': 'Content Security Policy',
                'referrer-policy': 'Referrer policy protection'
            };

            for (const [header, description] of Object.entries(securityHeaders)) {
                if (response.headers[header]) {
                    this.addTestResult(`Security Header: ${header}`, true, `${description} enabled`);
                } else {
                    this.addTestResult(`Security Header: ${header}`, false, `${description} missing`, 'warning');
                }
            }
        } catch (error) {
            this.addTestResult('Security Headers', false, `Unable to test headers: ${error.message}`);
        }
    }

    async generateReport() {
        const totalTests = this.results.passed + this.results.failed + this.results.warnings;
        const successRate = totalTests > 0 ? ((this.results.passed / totalTests) * 100).toFixed(1) : 0;

        console.log('\n' + '='.repeat(60));
        console.log('🛡️  SECURITY VALIDATION REPORT');
        console.log('='.repeat(60));
        console.log(`Application: ${this.baseUrl}`);
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.log(`Total Tests: ${totalTests}`);
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`⚠️  Warnings: ${this.results.warnings}`);
        console.log(`Success Rate: ${successRate}%`);
        console.log('='.repeat(60));

        return {
            success: this.results.failed === 0,
            report: this.results
        };
    }

    async runAllTests() {
        console.log(`🛡️  Starting security validation for: ${this.baseUrl}\n`);
        await this.testApplicationHealth();
        await this.testSecurityHeaders();
        return this.generateReport();
    }
}

module.exports = SecurityValidator;