// AI-Powered Quality Dashboard Configuration
module.exports = {
  name: 'Warehouse Network Quality Dashboard',
  version: '1.0.0',
  
  // Data collection settings
  collection: {
    interval: '*/15 * * * *', // Every 15 minutes
    sources: [
      {
        name: 'TypeScript',
        command: 'npm run type-check -- --json',
        parser: 'typescript'
      },
      {
        name: 'ESLint',
        command: 'npm run lint -- --format json',
        parser: 'eslint'
      },
      {
        name: 'Tests',
        command: 'npm test -- --json --coverage',
        parser: 'jest'
      },
      {
        name: 'Security',
        command: 'npm audit --json',
        parser: 'npm-audit'
      },
      {
        name: 'Bundle Size',
        command: 'npm run build && npx webpack-bundle-analyzer stats.json -m json',
        parser: 'webpack'
      }
    ]
  },
  
  // Metrics to track
  metrics: {
    codeQuality: {
      typeScriptErrors: {
        target: 0,
        warning: 5,
        critical: 10
      },
      eslintIssues: {
        target: 0,
        warning: 20,
        critical: 50
      },
      codeComplexity: {
        target: 10,
        warning: 15,
        critical: 20
      }
    },
    
    testing: {
      coverage: {
        target: 90,
        warning: 80,
        critical: 70
      },
      testsPassing: {
        target: 100,
        warning: 95,
        critical: 90
      }
    },
    
    security: {
      vulnerabilities: {
        target: 0,
        warning: 2,
        critical: 5
      },
      outdatedDeps: {
        target: 0,
        warning: 10,
        critical: 20
      }
    },
    
    performance: {
      bundleSize: {
        target: 500000, // 500KB
        warning: 750000, // 750KB
        critical: 1000000 // 1MB
      },
      buildTime: {
        target: 30000, // 30s
        warning: 60000, // 1m
        critical: 120000 // 2m
      }
    }
  },
  
  // AI-powered features
  ai: {
    enabled: true,
    features: {
      // Predictive analytics
      prediction: {
        enabled: true,
        model: 'quality-predictor-v1',
        factors: [
          'commit-frequency',
          'code-churn',
          'test-coverage-trend',
          'dependency-updates'
        ]
      },
      
      // Automated suggestions
      suggestions: {
        enabled: true,
        types: [
          'refactoring-opportunities',
          'test-improvements',
          'performance-optimizations',
          'security-hardening'
        ]
      },
      
      // Anomaly detection
      anomalyDetection: {
        enabled: true,
        sensitivity: 'medium',
        alerts: [
          'sudden-complexity-increase',
          'test-coverage-drop',
          'unusual-error-patterns'
        ]
      }
    }
  },
  
  // Dashboard UI settings
  ui: {
    theme: 'dark',
    refreshInterval: 30000, // 30 seconds
    
    widgets: [
      {
        type: 'quality-score',
        position: { x: 0, y: 0, w: 6, h: 4 },
        config: {
          showTrend: true,
          showDetails: true
        }
      },
      {
        type: 'test-coverage',
        position: { x: 6, y: 0, w: 6, h: 4 },
        config: {
          showGraph: true,
          timeRange: '7d'
        }
      },
      {
        type: 'security-status',
        position: { x: 0, y: 4, w: 4, h: 4 },
        config: {
          showVulnerabilities: true,
          showRecommendations: true
        }
      },
      {
        type: 'performance-metrics',
        position: { x: 4, y: 4, w: 4, h: 4 },
        config: {
          metrics: ['bundleSize', 'buildTime', 'loadTime']
        }
      },
      {
        type: 'ai-insights',
        position: { x: 8, y: 4, w: 4, h: 4 },
        config: {
          showPredictions: true,
          showSuggestions: true
        }
      },
      {
        type: 'recent-issues',
        position: { x: 0, y: 8, w: 12, h: 4 },
        config: {
          limit: 10,
          severity: ['error', 'warning']
        }
      }
    ]
  },
  
  // Alerting configuration
  alerts: {
    enabled: true,
    channels: [
      {
        type: 'email',
        enabled: false,
        recipients: ['team@warehouse-network.com']
      },
      {
        type: 'slack',
        enabled: false,
        webhook: process.env.SLACK_WEBHOOK_URL
      },
      {
        type: 'console',
        enabled: true
      }
    ],
    
    rules: [
      {
        name: 'Quality Score Drop',
        condition: 'quality_score < 70',
        severity: 'critical',
        message: 'Code quality score has dropped below 70%'
      },
      {
        name: 'Test Coverage Drop',
        condition: 'test_coverage < previous_coverage - 5',
        severity: 'warning',
        message: 'Test coverage has decreased by more than 5%'
      },
      {
        name: 'Security Vulnerability',
        condition: 'security_vulnerabilities > 0',
        severity: 'critical',
        message: 'Security vulnerabilities detected'
      }
    ]
  },
  
  // Reporting
  reports: {
    weekly: {
      enabled: true,
      schedule: '0 9 * * 1', // Every Monday at 9 AM
      recipients: ['team@warehouse-network.com'],
      includeMetrics: [
        'quality-trend',
        'test-coverage-trend',
        'security-summary',
        'performance-summary',
        'ai-recommendations'
      ]
    },
    
    monthly: {
      enabled: true,
      schedule: '0 9 1 * *', // First day of month at 9 AM
      recipients: ['management@warehouse-network.com'],
      includeMetrics: [
        'overall-health',
        'technical-debt',
        'team-productivity',
        'quality-improvements'
      ]
    }
  }
};