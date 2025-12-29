import { Command } from 'commander';
import { CodeQualityService, QualityMetricsCollector } from '../../services/code-quality';
import { logger } from '../../utils/logger';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';

export function createQualityCommand(): Command {
  const quality = new Command('quality')
    .description('Code quality analysis and management commands');

  quality
    .command('analyze')
    .description('Analyze code quality for a project')
    .option('-p, --path <path>', 'Project path to analyze', process.cwd())
    .option('-i, --project-id <id>', 'Project ID')
    .option('-b, --branch <branch>', 'Git branch')
    .option('-c, --commit <hash>', 'Git commit hash')
    .option('--compare-baseline', 'Compare with baseline from main branch')
    .option('--format <format>', 'Output format (json, text, html)', 'text')
    .option('-o, --output <file>', 'Output to file')
    .action(async (options) => {
      const spinner = ora('Analyzing code quality...').start();
      
      try {
        const qualityService = CodeQualityService.getInstance();
        const projectId = options.projectId || path.basename(options.path);
        
        // Run quality analysis
        const qualityCheck = await qualityService.analyzeForDeployment(
          options.path,
          projectId,
          {
            commitHash: options.commit,
            branch: options.branch,
            compareWithBaseline: options.compareBaseline
          }
        );
        
        spinner.succeed('Quality analysis completed');
        
        // Generate report
        const report = await qualityService.generateDeploymentReport(qualityCheck);
        
        // Format output
        let output: string;
        switch (options.format) {
          case 'json':
            output = JSON.stringify(report, null, 2);
            break;
          case 'html':
            output = generateHtmlReport(report, qualityCheck);
            break;
          default:
            output = generateTextReport(report, qualityCheck);
        }
        
        // Output results
        if (options.output) {
          await fs.writeFile(options.output, output);
          logger.info(chalk.green(`✓ Report saved to ${options.output}`));
        } else {
          logger.info(output);
        }
        
        // Exit with appropriate code
        process.exit(qualityCheck.passed ? 0 : 1);
      } catch (error) {
        spinner.fail('Quality analysis failed');
        logger.error('Quality analysis error:', error instanceof Error ? error : new Error(String(error)));
        logger.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  quality
    .command('gate')
    .description('Configure quality gates for a project')
    .requiredOption('-i, --project-id <id>', 'Project ID')
    .option('--min-score <score>', 'Minimum quality score (0-10)', parseFloat)
    .option('--max-complexity <value>', 'Maximum cyclomatic complexity', parseInt)
    .option('--min-coverage <percent>', 'Minimum test coverage percentage', parseFloat)
    .option('--max-duplication <percent>', 'Maximum code duplication percentage', parseFloat)
    .option('--max-security-critical <count>', 'Maximum critical security issues', parseInt)
    .option('--max-security-high <count>', 'Maximum high security issues', parseInt)
    .action(async (options) => {
      try {
        const qualityService = CodeQualityService.getInstance();
        
        const config: any = {
          enableSecurity: true,
          enableComplexity: true,
          enableCoverage: true,
          enableDuplication: true,
          enablePerformance: true,
          thresholds: {}
        };
        
        if (options.minScore !== undefined) {
          config.thresholds.minQualityScore = options.minScore;
        }
        if (options.maxComplexity !== undefined) {
          config.thresholds.maxCyclomaticComplexity = options.maxComplexity;
        }
        if (options.minCoverage !== undefined) {
          config.thresholds.minTestCoverage = options.minCoverage;
        }
        if (options.maxDuplication !== undefined) {
          config.thresholds.maxDuplicationPercentage = options.maxDuplication;
        }
        if (options.maxSecurityCritical !== undefined || options.maxSecurityHigh !== undefined) {
          config.thresholds.maxSecurityIssues = {
            critical: options.maxSecurityCritical ?? 0,
            high: options.maxSecurityHigh ?? 0,
            medium: 10,
            low: 20
          };
        }
        
        qualityService.configureQualityGate(options.projectId, config);
        
        logger.info(chalk.green(`✓ Quality gate configured for project ${options.projectId}`));
        logger.info('\nConfiguration:');
        logger.info(JSON.stringify(config, null, 2));
      } catch (error) {
        logger.error('Failed to configure quality gate:', error instanceof Error ? error : new Error(String(error)));
        logger.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  quality
    .command('check')
    .description('Check if deployment should be allowed based on quality')
    .requiredOption('-i, --project-id <id>', 'Project ID')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .option('--force', 'Force deployment despite quality issues')
    .option('--ignore <blockers>', 'Comma-separated list of blocker types to ignore')
    .action(async (options) => {
      const spinner = ora('Checking deployment readiness...').start();
      
      try {
        const qualityService = CodeQualityService.getInstance();
        
        const result = await qualityService.canDeploy(
          options.projectId,
          options.path,
          {
            force: options.force,
            ignoreBlockers: options.ignore?.split(',')
          }
        );
        
        if (result.allowed) {
          spinner.succeed('Deployment allowed');
          if (result.check) {
            logger.info(chalk.green(`\nQuality Score: ${result.check.score.overall.toFixed(1)}/10`));
          }
        } else {
          spinner.fail('Deployment blocked');
          logger.error(chalk.red(`\n${result.reason}`));
          
          if (result.check?.blockers && result.check.blockers.length > 0) {
            logger.info('\nBlockers:');
            result.check.blockers.forEach((blocker, index) => {
              const icon = blocker.severity === 'critical' ? '🚨' :
                          blocker.severity === 'high' ? '⚠️' :
                          blocker.severity === 'medium' ? '📋' : 'ℹ️';
              logger.info(`${icon}  ${index + 1}. [${blocker.severity.toUpperCase()}] ${blocker.description}`);
              if (blocker.recommendation) {
                logger.info(`    → ${blocker.recommendation}`);
              }
            });
          }
        }
        
        process.exit(result.allowed ? 0 : 1);
      } catch (error) {
        spinner.fail('Deployment check failed');
        logger.error('Deployment check error:', error instanceof Error ? error : new Error(String(error)));
        logger.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  quality
    .command('trends')
    .description('View quality trends for a project')
    .requiredOption('-i, --project-id <id>', 'Project ID')
    .option('-p, --period <period>', 'Time period (day, week, month)', 'week')
    .action(async (options) => {
      try {
        const qualityService = CodeQualityService.getInstance();
        const metricsCollector = QualityMetricsCollector.getInstance();
        
        // Get trends from service
        const trends = await qualityService.getQualityTrends(
          options.projectId,
          options.period as 'day' | 'week' | 'month'
        );
        
        // Get additional metrics
        const projectTrends = metricsCollector.getProjectTrends(
          options.projectId,
          options.period === 'day' ? 24 : 
          options.period === 'week' ? 168 : 720
        );
        
        logger.info(chalk.bold(`\nQuality Trends - ${options.projectId}`));
        logger.info(chalk.gray(`Period: Last ${options.period}`));
        logger.info('─'.repeat(50));
        
        if (trends.metrics.length > 0) {
          logger.info('\nScore Trends:');
          trends.metrics.forEach(metric => {
            const date = new Date(metric.date).toLocaleDateString();
            const scoreBar = '█'.repeat(Math.round(metric.qualityScore));
            const scoreColor = metric.qualityScore >= 8 ? chalk.green :
                              metric.qualityScore >= 6 ? chalk.yellow : chalk.red;
            logger.info(`${date}: ${scoreColor(scoreBar)} ${metric.qualityScore.toFixed(1)}`);
          });
        }
        
        logger.info('\nSummary:');
        logger.info(`Average Score: ${projectTrends.averageScore.toFixed(1)}/10`);
        logger.info(`Pass Rate: ${projectTrends.passRate.toFixed(1)}%`);
        logger.info(`Total Checks: ${projectTrends.totalChecks}`);
        
        if (Object.keys(projectTrends.commonIssues).length > 0) {
          logger.info('\nCommon Issues:');
          Object.entries(projectTrends.commonIssues).forEach(([issue, count]) => {
            logger.info(`- ${issue}: ${count} occurrences`);
          });
        }
      } catch (error) {
        logger.error('Failed to get quality trends:', error instanceof Error ? error : new Error(String(error)));
        logger.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  quality
    .command('metrics')
    .description('View aggregated quality metrics across all projects')
    .option('-h, --hours <hours>', 'Time window in hours', '24')
    .action(async (options) => {
      try {
        const metricsCollector = QualityMetricsCollector.getInstance();
        
        const metrics = metricsCollector.getAggregatedMetrics(parseInt(options.hours));
        const insights = metricsCollector.getPerformanceInsights();
        const alerts = metricsCollector.getQualityAlerts();
        
        logger.info(chalk.bold('\n📊 Quality Metrics Dashboard'));
        logger.info(chalk.gray(`Last ${options.hours} hours`));
        logger.info('═'.repeat(50));
        
        logger.info('\n📈 Overall Statistics:');
        logger.info(`Total Checks: ${metrics.totalChecks}`);
        logger.info(`Projects Analyzed: ${metrics.projectCount}`);
        logger.info(`Average Score: ${metrics.averageScore.toFixed(1)}/10`);
        logger.info(`Pass Rate: ${metrics.passRate.toFixed(1)}%`);
        logger.info(`Average Duration: ${(metrics.averageDuration / 1000).toFixed(1)}s`);
        
        if (metrics.scoreDistribution && Object.keys(metrics.scoreDistribution).length > 0) {
          logger.info('\n📊 Score Distribution:');
          Object.entries(metrics.scoreDistribution).forEach(([category, count]) => {
            const percentage = metrics.totalChecks > 0 
              ? ((count as number) / metrics.totalChecks * 100).toFixed(1) 
              : '0.0';
            const bar = '█'.repeat(Math.round(parseFloat(percentage) / 2));
            logger.info(`${category.padEnd(10)} ${bar} ${percentage}%`);
          });
        }
        
        if (insights.slowestProjects.length > 0) {
          logger.info('\n⏱️  Slowest Projects:');
          insights.slowestProjects.forEach((project, index) => {
            logger.info(`${index + 1}. ${project.projectId}: ${(project.avgDuration / 1000).toFixed(1)}s`);
          });
        }
        
        if (insights.lowestScores.length > 0) {
          logger.info('\n📉 Projects Needing Attention:');
          insights.lowestScores.forEach((project, index) => {
            const scoreColor = project.avgScore >= 7 ? chalk.yellow : chalk.red;
            logger.info(`${index + 1}. ${project.projectId}: ${scoreColor(project.avgScore.toFixed(1) + '/10')}`);
          });
        }
        
        if (alerts.length > 0) {
          logger.info(chalk.red('\n⚠️  Quality Degradation Alerts:'));
          alerts.forEach(alert => {
            logger.info(`- ${alert.projectId}: Score dropped from ${alert.previousScore.toFixed(1)} to ${alert.currentScore.toFixed(1)} (-${alert.drop.toFixed(1)})`);
          });
        }
      } catch (error) {
        logger.error('Failed to get quality metrics:', error instanceof Error ? error : new Error(String(error)));
        logger.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    });

  return quality;
}

function generateTextReport(report: any, check: any): string {
  const output: string[] = [];
  
  output.push(chalk.bold('\n📊 Code Quality Report'));
  output.push('═'.repeat(50));
  
  // Summary
  output.push('\n📈 Summary:');
  output.push(`Overall Score: ${check.score.overall.toFixed(1)}/10`);
  output.push(`Status: ${check.passed ? chalk.green('PASSED') : chalk.red('FAILED')}`);
  output.push(`Total Blockers: ${check.blockers.length}`);
  
  if (report.summary.improvements.length > 0) {
    output.push(`\n✨ Improvements:`);
    report.summary.improvements.forEach((imp: string) => output.push(`  - ${imp}`));
  }
  
  if (report.summary.degradations.length > 0) {
    output.push(`\n⚠️  Degradations:`);
    report.summary.degradations.forEach((deg: string) => output.push(`  - ${deg}`));
  }
  
  // Details
  output.push('\n📋 Detailed Analysis:');
  
  // Security
  output.push(`\n🔒 Security (${report.details.security.score.toFixed(1)}/10):`);
  output.push(`  Critical: ${report.details.security.vulnerabilities.critical}`);
  output.push(`  High: ${report.details.security.vulnerabilities.high}`);
  output.push(`  Medium: ${report.details.security.vulnerabilities.medium}`);
  output.push(`  Low: ${report.details.security.vulnerabilities.low}`);
  
  // Complexity
  output.push(`\n🧩 Complexity (${report.details.complexity.score.toFixed(1)}/10):`);
  output.push(`  Average Cyclomatic: ${report.details.complexity.summary.avgCyclomatic.toFixed(1)}`);
  output.push(`  Maximum Cyclomatic: ${report.details.complexity.summary.maxCyclomatic}`);
  output.push(`  Average Cognitive: ${report.details.complexity.summary.avgCognitive.toFixed(1)}`);
  output.push(`  Maximum Cognitive: ${report.details.complexity.summary.maxCognitive}`);
  
  // Coverage
  output.push(`\n🧪 Test Coverage (${report.details.coverage.score.toFixed(1)}/10):`);
  if (report.details.coverage.summary.line) {
    output.push(`  Line Coverage: ${report.details.coverage.summary.line.percentage.toFixed(1)}%`);
  }
  if (report.details.coverage.uncoveredFiles.length > 0) {
    output.push(`  Files with low coverage: ${report.details.coverage.uncoveredFiles.length}`);
  }
  
  // Duplication
  output.push(`\n📋 Code Duplication:`);
  output.push(`  Duplication: ${report.details.duplication.percentage.toFixed(1)}%`);
  output.push(`  Duplicated blocks: ${report.details.duplication.blocks}`);
  output.push(`  Duplicated lines: ${report.details.duplication.lines}`);
  
  // Blockers
  if (check.blockers.length > 0) {
    output.push('\n🚫 Blockers:');
    check.blockers.forEach((blocker: any, index: number) => {
      const icon = blocker.severity === 'critical' ? '🚨' :
                  blocker.severity === 'high' ? '⚠️' :
                  blocker.severity === 'medium' ? '📋' : 'ℹ️';
      output.push(`\n${icon}  ${index + 1}. [${blocker.severity.toUpperCase()}] ${blocker.type}`);
      output.push(`   ${blocker.description}`);
      if (blocker.recommendation) {
        output.push(`   → ${blocker.recommendation}`);
      }
    });
  }
  
  // Recommendations
  if (report.recommendations && report.recommendations.length > 0) {
    output.push('\n💡 Recommendations:');
    report.recommendations.forEach((rec: string) => output.push(`  - ${rec}`));
  }
  
  return output.join('\n');
}

function generateHtmlReport(report: any, check: any): string {
  return `<!DOCTYPE html>
<html>
<head>
    <title>Code Quality Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1, h2 { color: #333; }
        .summary { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .score { font-size: 24px; font-weight: bold; }
        .passed { color: green; }
        .failed { color: red; }
        .blocker { margin: 10px 0; padding: 10px; border-left: 3px solid; }
        .critical { border-color: red; background: #fee; }
        .high { border-color: orange; background: #ffeaa7; }
        .medium { border-color: yellow; background: #fffbcc; }
        .low { border-color: blue; background: #e3f2fd; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Code Quality Report</h1>
    
    <div class="summary">
        <h2>Summary</h2>
        <p class="score">Overall Score: ${check.score.overall.toFixed(1)}/10</p>
        <p>Status: <span class="${check.passed ? 'passed' : 'failed'}">${check.passed ? 'PASSED' : 'FAILED'}</span></p>
        <p>Total Blockers: ${check.blockers.length}</p>
    </div>
    
    <h2>Detailed Analysis</h2>
    
    <table>
        <tr>
            <th>Category</th>
            <th>Score</th>
            <th>Details</th>
        </tr>
        <tr>
            <td>Security</td>
            <td>${report.details.security.score.toFixed(1)}/10</td>
            <td>
                Critical: ${report.details.security.vulnerabilities.critical}<br>
                High: ${report.details.security.vulnerabilities.high}<br>
                Medium: ${report.details.security.vulnerabilities.medium}<br>
                Low: ${report.details.security.vulnerabilities.low}
            </td>
        </tr>
        <tr>
            <td>Complexity</td>
            <td>${report.details.complexity.score.toFixed(1)}/10</td>
            <td>
                Avg Cyclomatic: ${report.details.complexity.summary.avgCyclomatic.toFixed(1)}<br>
                Max Cyclomatic: ${report.details.complexity.summary.maxCyclomatic}
            </td>
        </tr>
        <tr>
            <td>Test Coverage</td>
            <td>${report.details.coverage.score.toFixed(1)}/10</td>
            <td>${report.details.coverage.summary.line?.percentage.toFixed(1) || 0}% line coverage</td>
        </tr>
        <tr>
            <td>Duplication</td>
            <td>-</td>
            <td>${report.details.duplication.percentage.toFixed(1)}% duplicated code</td>
        </tr>
    </table>
    
    ${check.blockers.length > 0 ? `
    <h2>Blockers</h2>
    ${check.blockers.map((blocker: any) => `
        <div class="blocker ${blocker.severity}">
            <strong>[${blocker.severity.toUpperCase()}] ${blocker.type}</strong><br>
            ${blocker.description}<br>
            ${blocker.recommendation ? `<em>Recommendation: ${blocker.recommendation}</em>` : ''}
        </div>
    `).join('')}
    ` : ''}
    
    ${report.recommendations && report.recommendations.length > 0 ? `
    <h2>Recommendations</h2>
    <ul>
        ${report.recommendations.map((rec: string) => `<li>${rec}</li>`).join('')}
    </ul>
    ` : ''}
</body>
</html>`;
}