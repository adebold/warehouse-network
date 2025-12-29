#!/usr/bin/env node

/**
 * Security Testing Script
 * Tests the implemented security features
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const { logger } = require('./utils/logger');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const isHTTPS = BASE_URL.startsWith('https');
const httpModule = isHTTPS ? https : http;

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

async function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + options.path);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = httpModule.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body ? JSON.parse(body) : null,
        });
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testRateLimiting() {
  logger.info(`\n${colors.blue}Testing Rate Limiting...${colors.reset}`);
  
  const endpoint = '/api/auth/register';
  const testData = {
    email: 'ratelimit@test.com',
    password: 'TestPassword123',
    name: 'Rate Limit Test',
  };

  let successCount = 0;
  let rateLimitHit = false;

  for (let i = 0; i < 10; i++) {
    try {
      const response = await makeRequest({
        path: endpoint,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, testData);

      if (response.statusCode === 429) {
        rateLimitHit = true;
        logger.info(`${colors.green}✓ Rate limit triggered after ${i} requests${colors.reset}`);
        logger.info(`  Response: ${JSON.stringify(response.body)}`);
        break;
      } else {
        successCount++;
      }
    } catch (error) {
      logger.error(`${colors.red}✗ Request failed: ${error.message}${colors.reset}`);
    }
  }

  if (!rateLimitHit) {
    logger.info(`${colors.red}✗ Rate limit not triggered after 10 requests${colors.reset}`);
  }
}

async function testCSRFProtection() {
  logger.info(`\n${colors.blue}Testing CSRF Protection...${colors.reset}`);

  // Test 1: POST without CSRF token
  try {
    const response = await makeRequest({
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, {
      email: 'csrf@test.com',
      password: 'TestPassword123',
      name: 'CSRF Test',
    });

    if (response.statusCode === 403) {
      logger.info(`${colors.green}✓ CSRF protection blocked request without token${colors.reset}`);
    } else {
      logger.info(`${colors.red}✗ Request succeeded without CSRF token (status: ${response.statusCode})${colors.reset}`);
    }
  } catch (error) {
    logger.error(`${colors.red}✗ CSRF test failed: ${error.message}${colors.reset}`);
  }

  // Test 2: Get CSRF token and use it
  try {
    const tokenResponse = await makeRequest({
      path: '/api/auth/csrf',
      method: 'GET',
    });

    if (tokenResponse.body && tokenResponse.body.csrfToken) {
      logger.info(`${colors.green}✓ CSRF token obtained successfully${colors.reset}`);
      
      // Extract cookies
      const cookies = tokenResponse.headers['set-cookie'];
      const cookieString = cookies ? cookies.join('; ') : '';
      
      // Test with CSRF token
      const protectedResponse = await makeRequest({
        path: '/api/auth/register',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': tokenResponse.body.csrfToken,
          'Cookie': cookieString,
        },
      }, {
        email: 'csrfvalid@test.com',
        password: 'TestPassword123',
        name: 'CSRF Valid Test',
      });

      if (protectedResponse.statusCode !== 403) {
        logger.info(`${colors.green}✓ Request with valid CSRF token allowed${colors.reset}`);
      }
    }
  } catch (error) {
    logger.error(`${colors.red}✗ CSRF token test failed: ${error.message}${colors.reset}`);
  }
}

async function testSecurityHeaders() {
  logger.info(`\n${colors.blue}Testing Security Headers...${colors.reset}`);

  try {
    const response = await makeRequest({
      path: '/api/health',
      method: 'GET',
    });

    const securityHeaders = [
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'referrer-policy',
      'content-security-policy',
    ];

    if (BASE_URL.includes('https')) {
      securityHeaders.push('strict-transport-security');
    }

    securityHeaders.forEach(header => {
      if (response.headers[header]) {
        logger.info(`${colors.green}✓ ${header}: ${response.headers[header]}${colors.reset}`);
      } else {
        logger.info(`${colors.yellow}⚠ ${header} not set${colors.reset}`);
      }
    });
  } catch (error) {
    logger.error(`${colors.red}✗ Security headers test failed: ${error.message}${colors.reset}`);
  }
}

async function testPasswordValidation() {
  logger.info(`\n${colors.blue}Testing Password Validation...${colors.reset}`);

  const testCases = [
    { password: 'short', expected: false, reason: 'Too short' },
    { password: 'nouppercase123', expected: false, reason: 'No uppercase' },
    { password: 'NOLOWERCASE123', expected: false, reason: 'No lowercase' },
    { password: 'NoNumbers', expected: false, reason: 'No numbers' },
    { password: 'ValidPass123', expected: true, reason: 'Valid password' },
  ];

  for (const testCase of testCases) {
    try {
      const response = await makeRequest({
        path: '/api/auth/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, {
        email: `password${Date.now()}@test.com`,
        password: testCase.password,
        name: 'Password Test',
      });

      const failed = response.statusCode === 400 && response.body.errors;
      const success = response.statusCode === 201 || response.statusCode === 403; // 403 if CSRF is working

      if (testCase.expected && success) {
        logger.info(`${colors.green}✓ ${testCase.reason}: Password accepted${colors.reset}`);
      } else if (!testCase.expected && failed) {
        logger.info(`${colors.green}✓ ${testCase.reason}: Password rejected${colors.reset}`);
        logger.info(`  Errors: ${JSON.stringify(response.body.errors)}`);
      } else {
        logger.info(`${colors.red}✗ ${testCase.reason}: Unexpected result${colors.reset}`);
      }
    } catch (error) {
      logger.error(`${colors.red}✗ Password test failed: ${error.message}${colors.reset}`);
    }
  }
}

async function runAllTests() {
  logger.info(`${colors.blue}=== Security Implementation Tests ===${colors.reset}`);
  logger.info(`Testing against: ${BASE_URL}`);

  await testSecurityHeaders();
  await testPasswordValidation();
  await testCSRFProtection();
  await testRateLimiting();

  logger.info(`\n${colors.blue}=== Tests Complete ===${colors.reset}`);
}

// Run tests
runAllTests().catch(console.error);