# Claude Code Quality

AI-powered code quality analysis with real-time ML models, AST parsing, security detection, and comprehensive code metrics.

## Features

- **AI-Powered Analysis**: Machine learning models for pattern detection, security vulnerabilities, and code quality predictions
- **Comprehensive Metrics**: Cyclomatic complexity, cognitive complexity, Halstead metrics, maintainability index
- **Security Scanning**: Detection of SQL injection, XSS, path traversal, crypto vulnerabilities, and more
- **Performance Analysis**: Identify performance bottlenecks and optimization opportunities
- **Code Smell Detection**: Find anti-patterns, design flaws, and maintainability issues
- **Technical Debt Calculation**: Estimate time and cost to fix issues
- **Multi-Language Support**: JavaScript, TypeScript, Python, Java, Go, Rust, C#, and more
- **Real-time Analysis**: Stream results as files are analyzed
- **Customizable Thresholds**: Configure quality gates for your team

## Installation

```bash
npm install @warehouse-network/claude-code-quality
```

## Quick Start

```javascript
import { createAnalyzer } from '@warehouse-network/claude-code-quality';

// Create analyzer with default settings
const analyzer = createAnalyzer();

// Analyze your codebase
const result = await analyzer.analyze(['src/**/*.ts']);

// Display results
console.log(`Overall Score: ${result.summary.overallScore}/100`);
console.log(`Issues Found: ${result.summary.totalIssues}`);
```

## CLI Usage

```bash
# Install globally
npm install -g @warehouse-network/claude-code-quality

# Initialize configuration
claude-code-quality init

# Analyze current directory
claude-code-quality analyze

# Analyze specific files/patterns
claude-code-quality analyze "src/**/*.ts" "lib/**/*.js"

# Generate HTML report
claude-code-quality analyze --format html --output report.html

# Disable AI features for faster analysis
claude-code-quality analyze --no-ai

# Custom complexity thresholds
claude-code-quality analyze --threshold-complexity 15 --threshold-cognitive 20
```

## Configuration

Create a `.claude-quality.json` file in your project root:

```json
{
  "enableAI": true,
  "enableSecurityScan": true,
  "enablePerformanceAnalysis": true,
  "enableDocumentationAnalysis": true,
  "enableTestAnalysis": true,
  
  "thresholds": {
    "complexity": {
      "cyclomatic": 10,
      "cognitive": 15
    },
    "maintainability": 60,
    "testCoverage": 80,
    "documentationCoverage": 70,
    "securityScore": 85,
    "performanceScore": 80
  },
  
  "modelConfig": {
    "enabledModels": ["pattern-detection", "security-scan", "performance"],
    "confidenceThreshold": 0.7,
    "cacheResults": true,
    "updateFrequency": "batch"
  },
  
  "include": ["src/**/*.ts", "lib/**/*.js"],
  "exclude": ["**/node_modules/**", "**/dist/**"],
  
  "output": {
    "format": "terminal",
    "includeRecommendations": true,
    "includeMetrics": true,
    "verbosity": "normal"
  }
}
```

## API Reference

### createAnalyzer(config?)

Creates a new analyzer instance.

```javascript
const analyzer = createAnalyzer({
  enableAI: true,
  thresholds: {
    complexity: { cyclomatic: 15 }
  }
});
```

### analyzer.analyze(paths)

Analyzes files and returns comprehensive results.

```javascript
const result = await analyzer.analyze(['src/**/*.ts']);

// Result structure
{
  timestamp: Date,
  duration: number,
  files: FileAnalysisResult[],
  summary: AnalysisSummary,
  metrics: CodeMetrics,
  issues: CodeIssue[],
  recommendations: RefactoringRecommendation[],
  aiInsights: AIInsights
}
```

### Metrics Explained

#### Complexity Metrics

- **Cyclomatic Complexity**: Number of linearly independent paths through code
- **Cognitive Complexity**: How difficult code is to understand
- **Halstead Metrics**: Software science metrics (volume, difficulty, effort)
- **Maintainability Index**: Overall maintainability score (0-100)

#### Quality Scores

- **Security**: Based on vulnerability count and severity
- **Performance**: Based on performance anti-patterns
- **Reliability**: Based on bug likelihood
- **Testability**: Based on code structure and complexity

## AI Models

### Pattern Detection
- Design patterns (Singleton, Factory, Observer, etc.)
- Anti-patterns (God Class, Spaghetti Code, etc.)
- Code smells (Long Method, Large Class, Feature Envy, etc.)

### Security Scanning
- SQL Injection
- Cross-Site Scripting (XSS)
- Path Traversal
- Insecure Cryptography
- Authentication Issues
- Secret Detection

### Performance Analysis
- N+1 Queries
- Memory Leaks
- Inefficient Algorithms
- Blocking Operations
- Resource Waste

## Integration

### GitHub Actions

```yaml
name: Code Quality
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx claude-code-quality analyze --format json --output quality-report.json
      - uses: actions/upload-artifact@v3
        with:
          name: quality-report
          path: quality-report.json
```

### Pre-commit Hook

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "claude-code-quality analyze --threshold-complexity 10"
    }
  }
}
```

## Advanced Usage

### Custom Analyzers

```javascript
import { BaseAnalyzer } from '@warehouse-network/claude-code-quality/analyzers';

class MyCustomAnalyzer extends BaseAnalyzer {
  async analyze(ast, content, filePath) {
    const issues = [];
    
    // Your analysis logic here
    this.traverse(ast, (node) => {
      if (this.isProblematic(node)) {
        issues.push(this.createIssue({
          type: 'custom-issue',
          severity: 'warning',
          message: 'Custom issue detected'
        }));
      }
    });
    
    return issues;
  }
}
```

### ML Model Training

```javascript
import { PatternDetectorModel } from '@warehouse-network/claude-code-quality/models';

const model = new PatternDetectorModel();
await model.train(trainingData);
await model.save('./my-custom-model');
```

## Performance

- Analyzes ~1000 files per minute
- ML predictions cached for speed
- Parallel processing with configurable concurrency
- Incremental analysis support

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © Claude Code Quality Team