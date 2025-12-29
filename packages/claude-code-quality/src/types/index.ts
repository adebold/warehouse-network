/**
 * Core types for claude-code-quality package
 */

export interface CodeQualityConfig {
  // Analysis settings
  enableAI: boolean;
  enableSecurityScan: boolean;
  enablePerformanceAnalysis: boolean;
  enableDocumentationAnalysis: boolean;
  enableTestAnalysis: boolean;
  
  // Thresholds
  thresholds: {
    complexity: {
      cyclomatic: number;
      cognitive: number;
    };
    maintainability: number;
    testCoverage: number;
    documentationCoverage: number;
    securityScore: number;
    performanceScore: number;
  };
  
  // ML Model settings
  modelConfig: {
    enabledModels: string[];
    confidenceThreshold: number;
    cacheResults: boolean;
    updateFrequency: 'realtime' | 'batch' | 'manual';
  };
  
  // File patterns
  include: string[];
  exclude: string[];
  
  // Output settings
  output: {
    format: 'json' | 'html' | 'markdown' | 'terminal';
    includeRecommendations: boolean;
    includeMetrics: boolean;
    verbosity: 'minimal' | 'normal' | 'detailed';
  };
}

export interface CodeMetrics {
  // Complexity metrics
  complexity: {
    cyclomatic: number;
    cognitive: number;
    halstead: HalsteadMetrics;
    maintainabilityIndex: number;
  };
  
  // Size metrics
  size: {
    lines: number;
    statements: number;
    functions: number;
    classes: number;
    files: number;
  };
  
  // Quality scores
  quality: {
    overall: number;
    security: number;
    performance: number;
    maintainability: number;
    reliability: number;
    testability: number;
  };
  
  // Coverage metrics
  coverage: {
    test: number;
    documentation: number;
    types: number;
  };
  
  // Technical debt
  debt: {
    score: number;
    time: string;
    cost: number;
    issues: TechnicalDebtIssue[];
  };
}

export interface HalsteadMetrics {
  vocabulary: number;
  length: number;
  calculatedLength: number;
  volume: number;
  difficulty: number;
  effort: number;
  time: number;
  bugs: number;
}

export interface TechnicalDebtIssue {
  type: 'security' | 'performance' | 'maintainability' | 'reliability' | 'testability';
  severity: 'low' | 'medium' | 'high' | 'critical';
  file: string;
  line: number;
  column: number;
  message: string;
  estimatedTime: string;
  cost: number;
  recommendation: string;
}

export interface CodeIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  file: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  message: string;
  rule: string;
  category: IssueCategory;
  aiConfidence: number;
  recommendation?: RefactoringRecommendation;
  context?: CodeContext;
}

export type IssueType = 
  | 'code-smell'
  | 'bug'
  | 'vulnerability'
  | 'performance'
  | 'maintainability'
  | 'documentation'
  | 'test'
  | 'accessibility'
  | 'best-practice';

export type IssueSeverity = 'info' | 'warning' | 'error' | 'critical';

export type IssueCategory = 
  | 'security'
  | 'performance'
  | 'reliability'
  | 'maintainability'
  | 'testability'
  | 'documentation'
  | 'style';

export interface RefactoringRecommendation {
  type: RefactoringType;
  description: string;
  impact: 'low' | 'medium' | 'high';
  effort: 'low' | 'medium' | 'high';
  automaticFix?: boolean;
  suggestedCode?: string;
  relatedPatterns?: string[];
}

export type RefactoringType =
  | 'extract-method'
  | 'rename'
  | 'simplify-conditional'
  | 'remove-duplication'
  | 'introduce-parameter-object'
  | 'replace-conditional-with-polymorphism'
  | 'extract-class'
  | 'inline-method'
  | 'move-method'
  | 'pull-up-method';

export interface CodeContext {
  functionName?: string;
  className?: string;
  moduleType?: string;
  dependencies?: string[];
  usages?: number;
  lastModified?: Date;
  author?: string;
}

export interface AnalysisResult {
  timestamp: Date;
  duration: number;
  files: FileAnalysisResult[];
  summary: AnalysisSummary;
  metrics: CodeMetrics;
  issues: CodeIssue[];
  recommendations: RefactoringRecommendation[];
  aiInsights: AIInsights;
}

export interface FileAnalysisResult {
  path: string;
  language: string;
  metrics: FileMetrics;
  issues: CodeIssue[];
  ast?: ASTNode;
  tokens?: Token[];
  dependencies?: Dependency[];
}

export interface FileMetrics {
  lines: number;
  statements: number;
  functions: number;
  classes: number;
  complexity: ComplexityMetrics;
  coupling: CouplingMetrics;
  cohesion: number;
}

export interface ComplexityMetrics {
  cyclomatic: number;
  cognitive: number;
  nesting: number;
  lineOfCode: number;
}

export interface CouplingMetrics {
  afferent: number;
  efferent: number;
  instability: number;
  abstractness: number;
}

export interface AnalysisSummary {
  totalFiles: number;
  totalIssues: number;
  issuesBySeverity: Record<IssueSeverity, number>;
  issuesByCategory: Record<IssueCategory, number>;
  overallScore: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface AIInsights {
  patterns: DetectedPattern[];
  predictions: QualityPrediction[];
  recommendations: StrategicRecommendation[];
  risks: RiskAssessment[];
}

export interface DetectedPattern {
  name: string;
  type: 'design-pattern' | 'anti-pattern' | 'code-smell';
  confidence: number;
  occurrences: number;
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

export interface QualityPrediction {
  metric: string;
  currentValue: number;
  predictedValue: number;
  timeframe: string;
  confidence: number;
  factors: string[];
}

export interface StrategicRecommendation {
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  title: string;
  description: string;
  estimatedImpact: string;
  estimatedEffort: string;
  steps: string[];
}

export interface RiskAssessment {
  category: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  likelihood: number;
  impact: number;
  mitigationStrategies: string[];
}

// AST related types
export interface ASTNode {
  type: string;
  start: number;
  end: number;
  loc: SourceLocation;
  range?: [number, number];
  children?: ASTNode[];
  [key: string]: any;
}

export interface SourceLocation {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  column: number;
}

export interface Token {
  type: string;
  value: string;
  start: number;
  end: number;
  loc: SourceLocation;
}

export interface Dependency {
  name: string;
  type: 'import' | 'require' | 'dynamic';
  path: string;
  isExternal: boolean;
  isDevDependency?: boolean;
}

// ML Model types
export interface MLModel {
  name: string;
  version: string;
  type: ModelType;
  accuracy: number;
  lastTrained: Date;
  features: string[];
  labels: string[];
}

export type ModelType = 
  | 'classification'
  | 'regression'
  | 'clustering'
  | 'neural-network'
  | 'deep-learning';

export interface TrainingData {
  input: number[][];
  output: number[][];
  metadata?: Record<string, any>;
}

export interface ModelPrediction {
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
  explanation?: string;
}