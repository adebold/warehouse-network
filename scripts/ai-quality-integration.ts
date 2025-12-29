#!/usr/bin/env tsx
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

interface CodeQualityResult {
  project: string;
  timestamp: string;
  metrics: {
    totalFiles: number;
    totalLines: number;
    typeScriptCoverage: number;
    eslintIssues: number;
    securityIssues: number;
    complexityScore: number;
    testCoverage: number;
    dependencies: {
      total: number;
      outdated: number;
      vulnerabilities: number;
    };
  };
  files: Array<{
    path: string;
    issues: Array<{
      type: 'error' | 'warning' | 'info';
      rule: string;
      message: string;
      line?: number;
    }>;
  }>;
}

class AICodeQualityAnalyzer {
  private projectRoot: string;
  private results: CodeQualityResult;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.results = {
      project: 'warehouse-network',
      timestamp: new Date().toISOString(),
      metrics: {
        totalFiles: 0,
        totalLines: 0,
        typeScriptCoverage: 0,
        eslintIssues: 0,
        securityIssues: 0,
        complexityScore: 0,
        testCoverage: 0,
        dependencies: {
          total: 0,
          outdated: 0,
          vulnerabilities: 0
        }
      },
      files: []
    };
  }

  async analyze(): Promise<CodeQualityResult> {
    console.log('🔍 Starting AI-powered code quality analysis...');
    
    await this.analyzeTypeScript();
    await this.analyzeESLint();
    await this.analyzeSecurity();
    await this.analyzeComplexity();
    await this.analyzeDependencies();
    await this.analyzeTestCoverage();
    
    return this.results;
  }

  private async analyzeTypeScript() {
    console.log('📘 Analyzing TypeScript...');
    try {
      // Count TypeScript files
      const tsFiles = await glob('**/*.{ts,tsx}', {
        cwd: this.projectRoot,
        ignore: ['node_modules/**', 'dist/**', '.next/**']
      });
      
      this.results.metrics.totalFiles = tsFiles.length;
      
      // Count lines of code
      let totalLines = 0;
      for (const file of tsFiles) {
        const content = fs.readFileSync(path.join(this.projectRoot, file), 'utf-8');
        totalLines += content.split('\n').length;
      }
      this.results.metrics.totalLines = totalLines;
      
      // Run TypeScript compiler
      try {
        execSync('npm run type-check', { cwd: this.projectRoot });
        this.results.metrics.typeScriptCoverage = 100;
      } catch (error: any) {
        const output = error.stdout?.toString() || '';
        const errorCount = (output.match(/error TS/g) || []).length;
        this.results.metrics.typeScriptCoverage = Math.max(0, 100 - (errorCount * 5));
      }
    } catch (error) {
      console.error('TypeScript analysis failed:', error);
    }
  }

  private async analyzeESLint() {
    console.log('🔧 Analyzing ESLint issues...');
    try {
      const output = execSync('npm run lint -- --format json', {
        cwd: this.projectRoot,
        encoding: 'utf-8'
      });
      
      const results = JSON.parse(output);
      let totalIssues = 0;
      
      for (const file of results) {
        if (file.errorCount || file.warningCount) {
          totalIssues += file.errorCount + file.warningCount;
          
          this.results.files.push({
            path: file.filePath.replace(this.projectRoot, ''),
            issues: file.messages.map((msg: any) => ({
              type: msg.severity === 2 ? 'error' : 'warning',
              rule: msg.ruleId || 'unknown',
              message: msg.message,
              line: msg.line
            }))
          });
        }
      }
      
      this.results.metrics.eslintIssues = totalIssues;
    } catch (error) {
      console.error('ESLint analysis failed:', error);
    }
  }

  private async analyzeSecurity() {
    console.log('🔐 Analyzing security issues...');
    try {
      execSync('npm audit --json > security-audit.json', {
        cwd: this.projectRoot,
        shell: true
      });
      
      const audit = JSON.parse(fs.readFileSync(
        path.join(this.projectRoot, 'security-audit.json'), 'utf-8'
      ));
      
      this.results.metrics.securityIssues = 
        (audit.metadata?.vulnerabilities?.total || 0);
      
      fs.unlinkSync(path.join(this.projectRoot, 'security-audit.json'));
    } catch (error) {
      console.error('Security analysis failed:', error);
    }
  }

  private async analyzeComplexity() {
    console.log('📊 Analyzing code complexity...');
    // Basic complexity calculation based on file size and function count
    const files = await glob('**/*.{ts,tsx,js,jsx}', {
      cwd: this.projectRoot,
      ignore: ['node_modules/**', 'dist/**', '.next/**']
    });
    
    let totalComplexity = 0;
    let fileCount = 0;
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(this.projectRoot, file), 'utf-8');
      const functionCount = (content.match(/function|=>|async/g) || []).length;
      const ifCount = (content.match(/if\s*\(/g) || []).length;
      const loopCount = (content.match(/for|while|do/g) || []).length;
      
      const complexity = functionCount + (ifCount * 1.5) + (loopCount * 2);
      totalComplexity += complexity;
      fileCount++;
    }
    
    this.results.metrics.complexityScore = Math.round(totalComplexity / fileCount);
  }

  private async analyzeDependencies() {
    console.log('📦 Analyzing dependencies...');
    try {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(this.projectRoot, 'package.json'), 'utf-8')
      );
      
      const deps = Object.keys(packageJson.dependencies || {});
      const devDeps = Object.keys(packageJson.devDependencies || {});
      
      this.results.metrics.dependencies.total = deps.length + devDeps.length;
      
      // Check for outdated packages
      try {
        const outdated = execSync('npm outdated --json', {
          cwd: this.projectRoot,
          encoding: 'utf-8'
        });
        
        if (outdated) {
          const outdatedPackages = JSON.parse(outdated);
          this.results.metrics.dependencies.outdated = Object.keys(outdatedPackages).length;
        }
      } catch (error) {
        // npm outdated exits with code 1 if packages are outdated
      }
    } catch (error) {
      console.error('Dependency analysis failed:', error);
    }
  }

  private async analyzeTestCoverage() {
    console.log('✅ Analyzing test coverage...');
    try {
      // Run tests with coverage
      execSync('npm test -- --coverage --coverageReporters=json-summary --watchAll=false', {
        cwd: this.projectRoot,
        stdio: 'pipe'
      });
      
      const coveragePath = path.join(this.projectRoot, 'coverage/coverage-summary.json');
      if (fs.existsSync(coveragePath)) {
        const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
        this.results.metrics.testCoverage = coverage.total?.lines?.pct || 0;
      }
    } catch (error) {
      console.error('Test coverage analysis failed:', error);
    }
  }

  generateReport(): string {
    const report = `
# 🤖 AI Code Quality Analysis Report

## Project: ${this.results.project}
**Analyzed at:** ${this.results.timestamp}

## 📊 Quality Metrics

| Metric | Value | Status |
|--------|-------|--------|
| Total Files | ${this.results.metrics.totalFiles} | ✅ |
| Total Lines | ${this.results.metrics.totalLines} | 📏 |
| TypeScript Coverage | ${this.results.metrics.typeScriptCoverage}% | ${this.getStatusIcon(this.results.metrics.typeScriptCoverage, 90)} |
| ESLint Issues | ${this.results.metrics.eslintIssues} | ${this.getStatusIcon(100 - this.results.metrics.eslintIssues, 95)} |
| Security Issues | ${this.results.metrics.securityIssues} | ${this.getStatusIcon(100 - this.results.metrics.securityIssues * 10, 100)} |
| Code Complexity | ${this.results.metrics.complexityScore} | ${this.getStatusIcon(100 - this.results.metrics.complexityScore, 80)} |
| Test Coverage | ${this.results.metrics.testCoverage}% | ${this.getStatusIcon(this.results.metrics.testCoverage, 80)} |

## 📦 Dependencies
- **Total:** ${this.results.metrics.dependencies.total}
- **Outdated:** ${this.results.metrics.dependencies.outdated}
- **Vulnerabilities:** ${this.results.metrics.dependencies.vulnerabilities}

## 🚨 Issues Found

${this.results.files.length === 0 ? '✅ No issues found!' : this.formatIssues()}

## 🎯 AI Recommendations

${this.generateRecommendations()}

## 🏆 Quality Score

**Overall Score:** ${this.calculateOverallScore()}/100

---
*Generated by AI Code Quality Analyzer*
`;
    return report;
  }

  private getStatusIcon(value: number, threshold: number): string {
    return value >= threshold ? '✅' : value >= threshold * 0.8 ? '⚠️' : '❌';
  }

  private formatIssues(): string {
    return this.results.files.slice(0, 10).map(file => `
### ${file.path}
${file.issues.map(issue => `- **${issue.type}** [${issue.rule}]: ${issue.message} ${issue.line ? `(line ${issue.line})` : ''}`).join('\n')}
`).join('\n');
  }

  private generateRecommendations(): string {
    const recommendations = [];
    
    if (this.results.metrics.typeScriptCoverage < 100) {
      recommendations.push('1. **Fix TypeScript errors** to improve type safety');
    }
    
    if (this.results.metrics.eslintIssues > 0) {
      recommendations.push('2. **Resolve ESLint issues** for better code quality');
    }
    
    if (this.results.metrics.securityIssues > 0) {
      recommendations.push('3. **Update vulnerable dependencies** to improve security');
    }
    
    if (this.results.metrics.complexityScore > 20) {
      recommendations.push('4. **Refactor complex functions** to improve maintainability');
    }
    
    if (this.results.metrics.testCoverage < 80) {
      recommendations.push('5. **Increase test coverage** to at least 80%');
    }
    
    if (this.results.metrics.dependencies.outdated > 5) {
      recommendations.push('6. **Update outdated packages** to get latest features and fixes');
    }
    
    return recommendations.length > 0 ? recommendations.join('\n') : '✅ Code quality is excellent!';
  }

  private calculateOverallScore(): number {
    const weights = {
      typescript: 0.25,
      eslint: 0.20,
      security: 0.25,
      complexity: 0.15,
      coverage: 0.15
    };
    
    const scores = {
      typescript: this.results.metrics.typeScriptCoverage,
      eslint: Math.max(0, 100 - this.results.metrics.eslintIssues),
      security: Math.max(0, 100 - this.results.metrics.securityIssues * 20),
      complexity: Math.max(0, 100 - this.results.metrics.complexityScore * 2),
      coverage: this.results.metrics.testCoverage
    };
    
    let totalScore = 0;
    for (const [key, weight] of Object.entries(weights)) {
      totalScore += scores[key as keyof typeof scores] * weight;
    }
    
    return Math.round(totalScore);
  }
}

// Run the analyzer
async function main() {
  const projectRoot = process.argv[2] || process.cwd();
  const outputFormat = process.argv[3] || 'markdown';
  
  const analyzer = new AICodeQualityAnalyzer(projectRoot);
  const results = await analyzer.analyze();
  
  if (outputFormat === 'json') {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const report = analyzer.generateReport();
    console.log(report);
    
    // Save report to file
    fs.writeFileSync(
      path.join(projectRoot, 'ai-quality-report.md'),
      report
    );
    console.log('\n📄 Report saved to ai-quality-report.md');
  }
}

main().catch(console.error);