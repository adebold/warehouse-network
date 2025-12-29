/**
 * Core type definitions for Claude Agent Tracker
 */

export interface AgentConfig {
  id: string;
  name: string;
  type: AgentType;
  capabilities: string[];
  metadata?: Record<string, any>;
  resources?: ResourceConfig;
  maxRetries?: number;
  timeout?: number;
}

export enum AgentType {
  CODER = 'coder',
  TESTER = 'tester',
  REVIEWER = 'reviewer',
  ARCHITECT = 'architect',
  RESEARCHER = 'researcher',
  ANALYZER = 'analyzer',
  COORDINATOR = 'coordinator',
  CUSTOM = 'custom'
}

export enum AgentStatus {
  IDLE = 'idle',
  SPAWNING = 'spawning',
  ACTIVE = 'active',
  BUSY = 'busy',
  PAUSED = 'paused',
  ERROR = 'error',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated'
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  pid?: number;
  capabilities: string[];
  startTime: Date;
  lastActivity: Date;
  metrics: AgentMetrics;
  tasks: Task[];
  errors: AgentError[];
  resources: ResourceUsage;
  metadata: Record<string, any>;
}

export interface Task {
  id: string;
  agentId: string;
  type: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  result?: any;
  error?: string;
  artifacts?: TaskArtifact[];
  dependencies?: string[];
}

export enum TaskStatus {
  PENDING = 'pending',
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface TaskArtifact {
  id: string;
  taskId: string;
  type: string;
  path: string;
  size: number;
  hash: string;
  metadata?: Record<string, any>;
}

export interface AgentMetrics {
  tasksCompleted: number;
  tasksFailed: number;
  averageTaskDuration: number;
  cpuUsage: number;
  memoryUsage: number;
  networkIO: NetworkMetrics;
  customMetrics?: Record<string, any>;
}

export interface NetworkMetrics {
  bytesIn: number;
  bytesOut: number;
  requestsIn: number;
  requestsOut: number;
}

export interface ResourceConfig {
  maxCpu?: number;
  maxMemory?: number;
  maxDisk?: number;
  maxNetwork?: number;
  priority?: number;
}

export interface ResourceUsage {
  cpu: number;
  memory: number;
  disk: number;
  network: NetworkMetrics;
  limits?: ResourceConfig;
}

export interface AgentError {
  id: string;
  agentId: string;
  timestamp: Date;
  type: ErrorType;
  message: string;
  stack?: string;
  context?: Record<string, any>;
}

export enum ErrorType {
  SPAWN = 'spawn',
  RUNTIME = 'runtime',
  RESOURCE = 'resource',
  TASK = 'task',
  COMMUNICATION = 'communication',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

export interface ChangeEvent {
  id: string;
  agentId: string;
  timestamp: Date;
  type: ChangeType;
  path: string;
  diff?: string;
  author?: string;
  message?: string;
  metadata?: Record<string, any>;
}

export enum ChangeType {
  FILE_CREATED = 'file_created',
  FILE_MODIFIED = 'file_modified',
  FILE_DELETED = 'file_deleted',
  DIRECTORY_CREATED = 'directory_created',
  DIRECTORY_DELETED = 'directory_deleted',
  GIT_COMMIT = 'git_commit',
  GIT_PUSH = 'git_push',
  GIT_MERGE = 'git_merge'
}

export interface MonitoringData {
  timestamp: Date;
  agentId: string;
  spans: TracingSpan[];
  metrics: MetricSnapshot[];
  logs: LogEntry[];
}

export interface TracingSpan {
  traceId: string;
  spanId: string;
  parentId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  status: SpanStatus;
  attributes: Record<string, any>;
}

export enum SpanStatus {
  UNSET = 'unset',
  OK = 'ok',
  ERROR = 'error'
}

export interface MetricSnapshot {
  name: string;
  type: MetricType;
  value: number;
  timestamp: Date;
  labels: Record<string, string>;
}

export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  SUMMARY = 'summary'
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context: Record<string, any>;
}

export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

export interface StreamEvent {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
  metadata?: Record<string, any>;
}

export interface AuthToken {
  token: string;
  type: string;
  expiresAt: Date;
  scopes: string[];
}

export interface User {
  id: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
  createdAt: Date;
  lastLogin?: Date;
}