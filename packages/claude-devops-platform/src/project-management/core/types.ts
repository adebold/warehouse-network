/**
 * Core types for project management system
 */

export enum StoryStatus {
  DRAFT = 'draft',
  PLANNED = 'planned',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  TESTING = 'testing',
  DONE = 'done',
  BLOCKED = 'blocked'
}

export enum StoryType {
  EPIC = 'epic',
  STORY = 'story',
  TASK = 'task',
  BUG = 'bug',
  SPIKE = 'spike'
}

export enum Priority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export interface AcceptanceCriteria {
  id: string;
  description: string;
  testable: boolean;
  automated?: boolean;
  testCases?: TestCase[];
}

export interface TestCase {
  id: string;
  given: string;
  when: string;
  then: string;
  status?: 'pending' | 'passed' | 'failed';
}

export interface UserStory {
  id: string;
  title: string;
  description: string;
  asA: string; // As a [role]
  iWant: string; // I want [feature]
  soThat: string; // So that [benefit]
  type: StoryType;
  status: StoryStatus;
  priority: Priority;
  storyPoints?: number;
  acceptanceCriteria: AcceptanceCriteria[];
  parentId?: string; // For hierarchy
  childIds?: string[]; // For hierarchy
  assignee?: string;
  reporter: string;
  sprint?: string;
  labels?: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  blockers?: string[];
  dependencies?: string[];
  attachments?: Attachment[];
  metrics?: StoryMetrics;
}

export interface Epic extends UserStory {
  type: StoryType.EPIC;
  targetRelease?: string;
  businessValue?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  stakeholders?: string[];
}

export interface StoryMetrics {
  cycleTime?: number;
  leadTime?: number;
  codeChurn?: number;
  testCoverage?: number;
  defectDensity?: number;
  performanceImpact?: PerformanceMetric[];
}

export interface PerformanceMetric {
  metric: string;
  baseline: number;
  current: number;
  target: number;
  unit: string;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'document' | 'diagram' | 'code';
  uploadedAt: Date;
  uploadedBy: string;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  startDate: Date;
  endDate: Date;
  stories: string[]; // Story IDs
  velocity?: number;
  plannedPoints: number;
  completedPoints?: number;
}

export interface DefinitionOfDone {
  id: string;
  name: string;
  criteria: DoneCriterion[];
  applicableTo: StoryType[];
}

export interface DoneCriterion {
  id: string;
  description: string;
  required: boolean;
  automatable: boolean;
  validator?: string; // Function or script to validate
}

export interface StoryTemplate {
  id: string;
  name: string;
  type: StoryType;
  template: {
    titlePattern?: string;
    descriptionTemplate?: string;
    defaultAcceptanceCriteria?: string[];
    defaultLabels?: string[];
    requiredFields?: string[];
  };
}

export interface RequirementTraceability {
  requirementId: string;
  storyIds: string[];
  testIds: string[];
  codeArtifacts: CodeArtifact[];
  coverage: number;
  status: 'traced' | 'partial' | 'missing';
}

export interface CodeArtifact {
  path: string;
  type: 'function' | 'class' | 'module' | 'api';
  coverage: number;
  lastModified: Date;
}