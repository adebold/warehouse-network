/**
 * Report Generator
 * 
 * Generates various report formats from analysis results
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import chalk from 'chalk';

import { 
import { logger } from '../../../../../../utils/logger';
  AnalysisResult, 
  CodeQualityConfig, 
  IssueSeverity
} from '../types';

export class ReportGenerator {
  private config: CodeQualityConfig;

  constructor(config: CodeQualityConfig) {
    this.config = config;
  }

  /**
   * Save report to file
   */
  async save(result: AnalysisResult, outputPath: string) {
    const format = this.config.output.format;
    let content: string;

    switch (format) {
      case 'json':
        content = this.generateJSON(result);
        break;
      case 'html':
        content = this.generateHTML(result);
        break;
      case 'markdown':
        content = this.generateMarkdown(result);
        break;
      default:
        content = this.generateJSON(result);
    }

    await fs.writeFile(outputPath, content, 'utf-8');
  }

  /**
   * Display results in terminal
   */
  displayTerminal(result: AnalysisResult) {
    logger.info('\n' + chalk.bold.underline('Code Quality Analysis Report'));
    logger.info(chalk.gray(`Generated: ${result.timestamp.toLocaleString()}`));
    logger.info(chalk.gray(`Duration: ${result.duration}ms`));
    logger.info();

    // Summary
    this.displaySummary(result);

    // Metrics
    if (this.config.output.includeMetrics) {
      this.displayMetrics(result);
    }

    // Issues
    this.displayIssues(result);

    // Recommendations
    if (this.config.output.includeRecommendations && result.recommendations.length > 0) {
      this.displayRecommendations(result);
    }

    // AI Insights
    if (this.config.enableAI && result.aiInsights) {
      this.displayAIInsights(result);
    }
  }

  /**
   * Display summary section
   */
  private displaySummary(result: AnalysisResult) {
    logger.info(chalk.bold('Summary:'));
    logger.info(`  Files analyzed: ${result.summary.totalFiles}`);
    logger.info(`  Total issues: ${result.summary.totalIssues}`);
    logger.info(`  Overall score: ${this.getScoreColor(result.summary.overallScore)}`);
    logger.info(`  Quality trend: ${this.getTrendIcon(result.summary.trend)}`);
    logger.info();

    // Issues by severity
    logger.info(chalk.bold('Issues by severity:'));
    const severities: IssueSeverity[] = ['critical', 'error', 'warning', 'info'];
    severities.forEach(severity => {
      const count = result.summary.issuesBySeverity[severity] || 0;
      if (count > 0) {
        logger.info(`  ${this.getSeverityIcon(severity)} ${severity}: ${count}`);
      }
    });
    logger.info();
  }

  /**
   * Display metrics section
   */
  private displayMetrics(result: AnalysisResult) {
    logger.info(chalk.bold('Metrics:'));
    const metrics = result.metrics;
    
    logger.info(chalk.underline('  Complexity:'));
    logger.info(`    Cyclomatic: ${metrics.complexity.cyclomatic}`);
    logger.info(`    Cognitive: ${metrics.complexity.cognitive}`);
    logger.info(`    Maintainability Index: ${metrics.complexity.maintainabilityIndex.toFixed(1)}`);
    
    logger.info(chalk.underline('  Quality Scores:'));
    logger.info(`    Security: ${this.getScoreColor(metrics.quality.security)}`);
    logger.info(`    Performance: ${this.getScoreColor(metrics.quality.performance)}`);
    logger.info(`    Reliability: ${this.getScoreColor(metrics.quality.reliability)}`);
    logger.info(`    Testability: ${this.getScoreColor(metrics.quality.testability)}`);
    
    if (metrics.debt.score > 0) {
      logger.info(chalk.underline('  Technical Debt:'));
      logger.info(`    Score: ${metrics.debt.score}`);
      logger.info(`    Estimated time: ${metrics.debt.time}`);
      logger.info(`    Estimated cost: $${metrics.debt.cost.toFixed(2)}`);
    }
    logger.info();
  }

  /**
   * Display issues section
   */
  private displayIssues(result: AnalysisResult) {
    if (result.issues.length === 0) {
      logger.info(chalk.green('No issues found!'));
      return;
    }

    logger.info(chalk.bold(`Issues (${result.issues.length}):`));
    
    // Group by file
    const issuesByFile = new Map<string, typeof result.issues>();
    result.issues.forEach(issue => {
      if (!issuesByFile.has(issue.file)) {
        issuesByFile.set(issue.file, []);
      }
      issuesByFile.get(issue.file)!.push(issue);
    });

    // Display issues
    issuesByFile.forEach((issues, file) => {
      logger.info(`\n  ${chalk.cyan(this.getRelativePath(file))}`);
      
      issues.forEach(issue => {
        const icon = this.getSeverityIcon(issue.severity);
        const location = `${issue.startLine}:${issue.startColumn}`;
        logger.info(`    ${icon} ${chalk.gray(location)} ${issue.message}`);
        
        if (this.config.output.verbosity === 'detailed') {
          logger.info(`       ${chalk.gray(`Rule: ${issue.rule}`)}`);
          logger.info(`       ${chalk.gray(`Category: ${issue.category}`)}`);
          if (issue.aiConfidence < 1) {
            logger.info(`       ${chalk.gray(`AI Confidence: ${(issue.aiConfidence * 100).toFixed(0)}%`)}`);
          }
        }
      });
    });
    logger.info();
  }

  /**
   * Display recommendations section
   */
  private displayRecommendations(result: AnalysisResult) {
    logger.info(chalk.bold('Refactoring Recommendations:'));
    
    const uniqueRecommendations = new Map();
    result.recommendations.forEach(rec => {
      const key = `${rec.type}-${rec.description}`;
      if (!uniqueRecommendations.has(key)) {
        uniqueRecommendations.set(key, rec);
      }
    });

    uniqueRecommendations.forEach(rec => {
      logger.info(`\n  ${chalk.yellow('→')} ${rec.description}`);
      logger.info(`     Type: ${rec.type}`);
      logger.info(`     Impact: ${this.getImpactColor(rec.impact)} | Effort: ${this.getEffortColor(rec.effort)}`);
    });
    logger.info();
  }

  /**
   * Display AI insights section
   */
  private displayAIInsights(result: AnalysisResult) {
    const insights = result.aiInsights;
    
    if (insights.patterns.length > 0) {
      logger.info(chalk.bold('Detected Patterns:'));
      insights.patterns.forEach(pattern => {
        const icon = pattern.impact === 'positive' ? '✓' : 
                    pattern.impact === 'negative' ? '✗' : '•';
        logger.info(`  ${icon} ${pattern.name} (${(pattern.confidence * 100).toFixed(0)}% confidence)`);
        logger.info(`     ${chalk.gray(pattern.description)}`);
      });
      logger.info();
    }

    if (insights.risks.length > 0) {
      logger.info(chalk.bold('Risk Assessment:'));
      insights.risks.forEach(risk => {
        const color = risk.level === 'critical' ? chalk.red :
                     risk.level === 'high' ? chalk.yellow :
                     risk.level === 'medium' ? chalk.blue :
                     chalk.gray;
        logger.info(`  ${color('●')} ${risk.category}: ${risk.description}`);
      });
      logger.info();
    }
  }

  /**
   * Generate JSON report
   */
  private generateJSON(result: AnalysisResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Generate HTML report
   */
  private generateHTML(result: AnalysisResult): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Code Quality Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; }
    h1, h2, h3 { color: #333; }
    .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .metric { display: inline-block; margin: 10px 20px 10px 0; }
    .score { font-size: 24px; font-weight: bold; }
    .good { color: #28a745; }
    .warning { color: #ffc107; }
    .error { color: #dc3545; }
    .issue { margin: 10px 0; padding: 10px; background: #f8f9fa; border-left: 4px solid #dee2e6; }
    .issue.critical { border-left-color: #dc3545; }
    .issue.error { border-left-color: #fd7e14; }
    .issue.warning { border-left-color: #ffc107; }
    .issue.info { border-left-color: #0dcaf0; }
  </style>
</head>
<body>
  <h1>Code Quality Analysis Report</h1>
  <p>Generated: ${result.timestamp.toLocaleString()}</p>
  
  <div class="summary">
    <h2>Summary</h2>
    <div class="metric">
      <div>Files Analyzed</div>
      <div class="score">${result.summary.totalFiles}</div>
    </div>
    <div class="metric">
      <div>Total Issues</div>
      <div class="score">${result.summary.totalIssues}</div>
    </div>
    <div class="metric">
      <div>Overall Score</div>
      <div class="score ${this.getScoreClass(result.summary.overallScore)}">${result.summary.overallScore.toFixed(1)}</div>
    </div>
  </div>
  
  <h2>Issues</h2>
  ${result.issues.map(issue => `
    <div class="issue ${issue.severity}">
      <strong>${issue.file}:${issue.startLine}</strong><br>
      ${issue.message}<br>
      <small>Rule: ${issue.rule} | Category: ${issue.category}</small>
    </div>
  `).join('')}
  
</body>
</html>`;
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdown(result: AnalysisResult): string {
    let md = '# Code Quality Analysis Report\n\n';
    md += `Generated: ${result.timestamp.toLocaleString()}\n\n`;
    
    md += '## Summary\n\n';
    md += `- Files analyzed: ${result.summary.totalFiles}\n`;
    md += `- Total issues: ${result.summary.totalIssues}\n`;
    md += `- Overall score: ${result.summary.overallScore.toFixed(1)}/100\n`;
    md += `- Quality trend: ${result.summary.trend}\n\n`;
    
    md += '## Issues by Severity\n\n';
    Object.entries(result.summary.issuesBySeverity).forEach(([severity, count]) => {
      if (count > 0) {
        md += `- ${severity}: ${count}\n`;
      }
    });
    
    if (result.issues.length > 0) {
      md += '\n## Issues\n\n';
      result.issues.forEach(issue => {
        md += `### ${issue.file}:${issue.startLine}\n`;
        md += `**${issue.severity}**: ${issue.message}\n`;
        md += `- Rule: ${issue.rule}\n`;
        md += `- Category: ${issue.category}\n\n`;
      });
    }
    
    return md;
  }

  // Helper methods

  private getScoreColor(score: number): string {
    if (score >= 80) {return chalk.green(`${score.toFixed(1)}/100`);}
    if (score >= 60) {return chalk.yellow(`${score.toFixed(1)}/100`);}
    return chalk.red(`${score.toFixed(1)}/100`);
  }

  private getScoreClass(score: number): string {
    if (score >= 80) {return 'good';}
    if (score >= 60) {return 'warning';}
    return 'error';
  }

  private getSeverityIcon(severity: IssueSeverity): string {
    switch (severity) {
      case 'critical': return chalk.red('✗');
      case 'error': return chalk.red('●');
      case 'warning': return chalk.yellow('▲');
      case 'info': return chalk.blue('ℹ');
    }
  }

  private getTrendIcon(trend: string): string {
    switch (trend) {
      case 'improving': return chalk.green('↑ improving');
      case 'declining': return chalk.red('↓ declining');
      default: return chalk.gray('→ stable');
    }
  }

  private getImpactColor(impact: string): string {
    switch (impact) {
      case 'high': return chalk.red(impact);
      case 'medium': return chalk.yellow(impact);
      case 'low': return chalk.green(impact);
      default: return impact;
    }
  }

  private getEffortColor(effort: string): string {
    switch (effort) {
      case 'high': return chalk.red(effort);
      case 'medium': return chalk.yellow(effort);
      case 'low': return chalk.green(effort);
      default: return effort;
    }
  }

  private getRelativePath(filePath: string): string {
    return path.relative(process.cwd(), filePath);
  }
}