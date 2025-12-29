/**
 * Security Analyzer
 * 
 * Detects security vulnerabilities and unsafe patterns
 */

import { SecurityModel } from '../../models/security-model';
import { ASTNode, CodeIssue, CodeQualityConfig } from '../../types';
import { BaseAnalyzer } from '../base-analyzer';

import { AuthenticationDetector } from './authentication';
import { CryptoDetector } from './crypto';
import { PathTraversalDetector } from './path-traversal';
import { SecretDetector } from './secrets';
import { SQLInjectionDetector } from './sql-injection';
import { XSSDetector } from './xss';

export class SecurityAnalyzer extends BaseAnalyzer {
  private securityModel: SecurityModel;
  private sqlInjectionDetector: SQLInjectionDetector;
  private xssDetector: XSSDetector;
  private pathTraversalDetector: PathTraversalDetector;
  private cryptoDetector: CryptoDetector;
  private authDetector: AuthenticationDetector;
  private secretDetector: SecretDetector;

  constructor(config: CodeQualityConfig) {
    super(config);
    
    this.securityModel = new SecurityModel();
    this.sqlInjectionDetector = new SQLInjectionDetector();
    this.xssDetector = new XSSDetector();
    this.pathTraversalDetector = new PathTraversalDetector();
    this.cryptoDetector = new CryptoDetector();
    this.authDetector = new AuthenticationDetector();
    this.secretDetector = new SecretDetector();
  }

  async analyze(ast: ASTNode, content: string, filePath: string): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];

    // Run all detectors in parallel
    const [
      sqlIssues,
      xssIssues,
      pathIssues,
      cryptoIssues,
      authIssues,
      secretIssues,
      mlDetectedIssues
    ] = await Promise.all([
      this.sqlInjectionDetector.detect(ast, content, filePath),
      this.xssDetector.detect(ast, content, filePath),
      this.pathTraversalDetector.detect(ast, content, filePath),
      this.cryptoDetector.detect(ast, content, filePath),
      this.authDetector.detect(ast, content, filePath),
      this.secretDetector.detect(ast, content, filePath),
      this.detectWithML(ast, content, filePath)
    ]);

    // Combine all issues
    issues.push(
      ...sqlIssues,
      ...xssIssues,
      ...pathIssues,
      ...cryptoIssues,
      ...authIssues,
      ...secretIssues,
      ...mlDetectedIssues
    );

    // Remove duplicates
    return this.deduplicateIssues(issues);
  }

  /**
   * Detect vulnerabilities using ML model
   */
  private async detectWithML(ast: ASTNode, content: string, filePath: string): Promise<CodeIssue[]> {
    if (!this.config.enableAI) {return [];}

    const vulnerabilities = await this.securityModel.detectVulnerabilities(ast, content);
    
    return vulnerabilities.map(vuln => this.createIssue({
      type: 'vulnerability',
      severity: this.mapVulnerabilitySeverity(vuln.severity),
      file: filePath,
      startLine: vuln.location.start.line,
      endLine: vuln.location.end.line,
      startColumn: vuln.location.start.column,
      endColumn: vuln.location.end.column,
      message: vuln.description,
      rule: `security-ml-${vuln.type}`,
      category: 'security',
      aiConfidence: vuln.confidence,
      recommendation: {
        type: 'replace-conditional-with-polymorphism',
        description: vuln.fix,
        impact: 'high',
        effort: 'medium',
        suggestedCode: vuln.suggestedCode
      }
    }));
  }

  /**
   * Warm up ML models
   */
  async warmUp() {
    await this.securityModel.initialize();
  }

  /**
   * Deduplicate issues
   */
  private deduplicateIssues(issues: CodeIssue[]): CodeIssue[] {
    const seen = new Set<string>();
    
    return issues.filter(issue => {
      const key = `${issue.file}:${issue.startLine}:${issue.rule}`;
      if (seen.has(key)) {return false;}
      seen.add(key);
      return true;
    });
  }

  /**
   * Map vulnerability severity
   */
  private mapVulnerabilitySeverity(severity: string): 'info' | 'warning' | 'error' | 'critical' {
    switch (severity.toLowerCase()) {
      case 'critical':
      case 'high':
        return 'critical';
      case 'medium':
        return 'error';
      case 'low':
        return 'warning';
      default:
        return 'info';
    }
  }
}