/**
 * Custom Jest test results processor
 * Formats and enhances test results for CI/CD and reporting
 */

const fs = require('fs');
const path = require('path');

module.exports = (results) => {
  const {
    numFailedTests,
    numPassedTests,
    numPendingTests,
    testResults,
    startTime,
    success
  } = results;

  const endTime = Date.now();
  const duration = endTime - startTime;

  // Create enhanced test report
  const report = {
    summary: {
      total: numPassedTests + numFailedTests + numPendingTests,
      passed: numPassedTests,
      failed: numFailedTests,
      pending: numPendingTests,
      success,
      duration,
      timestamp: new Date().toISOString()
    },
    details: testResults.map(testResult => ({
      testFilePath: testResult.testFilePath,
      numFailingTests: testResult.numFailingTests,
      numPassingTests: testResult.numPassingTests,
      numPendingTests: testResult.numPendingTests,
      duration: testResult.perfStats?.end - testResult.perfStats?.start,
      coverage: testResult.coverage ? {
        lines: testResult.coverage.lines,
        functions: testResult.coverage.functions,
        branches: testResult.coverage.branches,
        statements: testResult.coverage.statements
      } : null,
      failureMessages: testResult.failureMessage ? [testResult.failureMessage] : [],
      assertionResults: testResult.testResults?.map(test => ({
        title: test.title,
        status: test.status,
        duration: test.duration,
        failureMessages: test.failureMessages
      })) || []
    })),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      ci: process.env.CI || false,
      coverage: results.coverageMap ? true : false
    },
    performance: {
      slowTests: testResults
        .filter(test => {
          const duration = test.perfStats?.end - test.perfStats?.start;
          return duration > 5000; // Tests slower than 5 seconds
        })
        .map(test => ({
          file: test.testFilePath,
          duration: test.perfStats?.end - test.perfStats?.start
        }))
        .sort((a, b) => b.duration - a.duration)
    }
  };

  // Write detailed report to file
  const reportDir = './test-results';
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const reportPath = path.join(reportDir, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Generate JUnit XML for CI systems
  generateJUnitXML(report, path.join(reportDir, 'junit.xml'));

  // Generate console summary
  generateConsoleSummary(report);

  return results;
};

function generateJUnitXML(report, outputPath) {
  const escapeXML = (str) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<testsuites name="Claude DB Integrity Tests" tests="${report.summary.total}" failures="${report.summary.failed}" time="${report.summary.duration / 1000}">\n`;

  report.details.forEach(testFile => {
    const suiteName = path.basename(testFile.testFilePath);
    xml += `  <testsuite name="${escapeXML(suiteName)}" tests="${testFile.numPassingTests + testFile.numFailingTests}" failures="${testFile.numFailingTests}" time="${(testFile.duration || 0) / 1000}">\n`;
    
    testFile.assertionResults.forEach(test => {
      xml += `    <testcase name="${escapeXML(test.title)}" time="${(test.duration || 0) / 1000}"`;
      
      if (test.status === 'failed') {
        xml += '>\n';
        xml += `      <failure message="${escapeXML(test.failureMessages[0] || 'Test failed')}">\n`;
        xml += `        ${escapeXML(test.failureMessages.join('\n'))}\n`;
        xml += '      </failure>\n';
        xml += '    </testcase>\n';
      } else {
        xml += ' />\n';
      }
    });
    
    xml += '  </testsuite>\n';
  });

  xml += '</testsuites>\n';

  fs.writeFileSync(outputPath, xml);
}

function generateConsoleSummary(report) {
  console.log('\n📊 Test Results Summary');
  console.log('========================');
  console.log(`Total Tests: ${report.summary.total}`);
  console.log(`✅ Passed: ${report.summary.passed}`);
  console.log(`❌ Failed: ${report.summary.failed}`);
  console.log(`⏸️  Pending: ${report.summary.pending}`);
  console.log(`⏱️  Duration: ${(report.summary.duration / 1000).toFixed(2)}s`);

  if (report.performance.slowTests.length > 0) {
    console.log('\n⚠️  Slow Tests (>5s):');
    report.performance.slowTests.slice(0, 5).forEach(test => {
      console.log(`   ${path.basename(test.file)}: ${(test.duration / 1000).toFixed(2)}s`);
    });
  }

  if (report.summary.failed > 0) {
    console.log('\n❌ Failed Tests:');
    report.details.forEach(testFile => {
      if (testFile.numFailingTests > 0) {
        console.log(`   ${path.basename(testFile.testFilePath)}: ${testFile.numFailingTests} failed`);
      }
    });
  }

  console.log(`\n📄 Detailed report saved to: test-results/test-report.json`);
  console.log('========================\n');
}