import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { logger } from '../utils/logger';
import { config } from '../config';
import { MetricsCollector } from '../utils/metrics';
import crypto from 'crypto';

export interface GitHubConfig {
  token?: string;
  appId?: string;
  privateKey?: string;
  installationId?: number;
  baseUrl?: string;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  head_branch: string;
  head_sha: string;
  run_number: number;
  workflow_id: number;
}

export interface DeploymentOptions {
  owner: string;
  repo: string;
  ref: string;
  task?: string;
  auto_merge?: boolean;
  required_contexts?: string[];
  payload?: any;
  environment?: string;
  description?: string;
  transient_environment?: boolean;
  production_environment?: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed';
  merged: boolean;
  draft: boolean;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  user: {
    login: string;
  };
  created_at: string;
  updated_at: string;
}

export interface WebhookPayload {
  event: string;
  signature: string;
  body: any;
}

export interface WorkflowOptions {
  owner: string;
  repo: string;
  workflow_id: string | number;
  ref: string;
  inputs?: { [key: string]: any };
}

export interface PullRequestOptions {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body?: string;
  maintainer_can_modify?: boolean;
  draft?: boolean;
}

export interface IssueOptions {
  owner: string;
  repo: string;
  title: string;
  body?: string;
  milestone?: number;
  labels?: string[];
  assignees?: string[];
}

export type WebhookEvent = 
  | 'push'
  | 'pull_request'
  | 'pull_request_review'
  | 'pull_request_review_comment'
  | 'issues'
  | 'issue_comment'
  | 'create'
  | 'delete'
  | 'deployment'
  | 'deployment_status'
  | 'fork'
  | 'release'
  | 'workflow_run'
  | 'check_run'
  | 'check_suite';

export enum DeploymentStatus {
  ERROR = 'error',
  FAILURE = 'failure',
  INACTIVE = 'inactive',
  IN_PROGRESS = 'in_progress',
  QUEUED = 'queued',
  PENDING = 'pending',
  SUCCESS = 'success',
}

export interface CheckRunOptions {
  owner: string;
  repo: string;
  name: string;
  head_sha: string;
  status?: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'action_required' | 'cancelled' | 'failure' | 'neutral' | 'success' | 'skipped' | 'stale' | 'timed_out';
  started_at?: string;
  completed_at?: string;
  output?: {
    title: string;
    summary: string;
    text?: string;
    annotations?: Array<{
      path: string;
      start_line: number;
      end_line: number;
      start_column?: number;
      end_column?: number;
      annotation_level: 'notice' | 'warning' | 'failure';
      message: string;
      title?: string;
      raw_details?: string;
    }>;
  };
}

export interface ReleaseOptions {
  owner: string;
  repo: string;
  tag_name: string;
  target_commitish?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  generate_release_notes?: boolean;
}

export class GitHubService {
  private static instance: GitHubService;
  private octokit: Octokit;
  private webhookSecret?: string;

  private constructor(gitHubConfig?: GitHubConfig) {
    if (gitHubConfig?.appId && gitHubConfig?.privateKey && gitHubConfig?.installationId) {
      // GitHub App authentication
      this.octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: gitHubConfig.appId,
          privateKey: gitHubConfig.privateKey,
          installationId: gitHubConfig.installationId,
        },
        baseUrl: gitHubConfig.baseUrl,
      });
    } else if (gitHubConfig?.token || config.github?.token) {
      // Personal access token authentication
      this.octokit = new Octokit({
        auth: gitHubConfig?.token || config.github?.token,
        baseUrl: gitHubConfig?.baseUrl,
      });
    } else {
      throw new Error('GitHub authentication not configured');
    }

    this.webhookSecret = config.github?.webhookSecret;
  }

  public static async initialize(gitHubConfig?: GitHubConfig): Promise<GitHubService> {
    if (!GitHubService.instance) {
      GitHubService.instance = new GitHubService(gitHubConfig);
      await GitHubService.instance.testConnection();
    }
    return GitHubService.instance;
  }

  public static getInstance(): GitHubService {
    if (!GitHubService.instance) {
      throw new Error('GitHubService not initialized. Call initialize() first.');
    }
    return GitHubService.instance;
  }

  private async testConnection(): Promise<void> {
    try {
      const { data } = await this.octokit.users.getAuthenticated();
      logger.info('Successfully connected to GitHub', { user: data.login });
    } catch (error) {
      logger.error('Failed to connect to GitHub:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Workflow operations
  public async triggerWorkflow(
    owner: string,
    repo: string,
    workflowId: string | number,
    ref: string,
    inputs?: { [key: string]: any }
  ): Promise<void> {
    try {
      await this.octokit.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: workflowId,
        ref,
        inputs,
      });
      
      logger.info('Triggered workflow', { owner, repo, workflowId, ref });
      MetricsCollector.recordGitHubOperation('trigger_workflow', 'success');
    } catch (error) {
      MetricsCollector.recordGitHubOperation('trigger_workflow', 'failure');
      logger.error('Failed to trigger workflow:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async listWorkflowRuns(
    owner: string,
    repo: string,
    workflowId?: string | number,
    options?: {
      branch?: string;
      status?: 'queued' | 'in_progress' | 'completed';
      per_page?: number;
      page?: number;
    }
  ): Promise<WorkflowRun[]> {
    try {
      const params: any = {
        owner,
        repo,
        ...(workflowId && { workflow_id: workflowId }),
        ...(options?.branch && { branch: options.branch }),
        ...(options?.status && { status: options.status }),
        per_page: options?.per_page || 30,
        page: options?.page || 1,
      };

      const { data } = await this.octokit.actions.listWorkflowRunsForRepo(params);
      
      return data.workflow_runs as WorkflowRun[];
    } catch (error) {
      logger.error('Failed to list workflow runs:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getWorkflowRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<WorkflowRun> {
    try {
      const { data } = await this.octokit.actions.getWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });
      
      return data as WorkflowRun;
    } catch (error) {
      logger.error('Failed to get workflow run:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async cancelWorkflowRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<void> {
    try {
      await this.octokit.actions.cancelWorkflowRun({
        owner,
        repo,
        run_id: runId,
      });
      
      logger.info('Cancelled workflow run', { owner, repo, runId });
      MetricsCollector.recordGitHubOperation('cancel_workflow', 'success');
    } catch (error) {
      MetricsCollector.recordGitHubOperation('cancel_workflow', 'failure');
      logger.error('Failed to cancel workflow run:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async rerunWorkflow(
    owner: string,
    repo: string,
    runId: number
  ): Promise<void> {
    try {
      await this.octokit.actions.reRunWorkflow({
        owner,
        repo,
        run_id: runId,
      });
      
      logger.info('Rerun workflow', { owner, repo, runId });
      MetricsCollector.recordGitHubOperation('rerun_workflow', 'success');
    } catch (error) {
      MetricsCollector.recordGitHubOperation('rerun_workflow', 'failure');
      logger.error('Failed to rerun workflow:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getWorkflowRunLogs(
    owner: string,
    repo: string,
    runId: number
  ): Promise<ArrayBuffer> {
    try {
      const { data } = await this.octokit.actions.downloadWorkflowRunLogs({
        owner,
        repo,
        run_id: runId,
      });
      
      return data as ArrayBuffer;
    } catch (error) {
      logger.error('Failed to get workflow run logs:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Deployment operations
  public async createDeployment(options: DeploymentOptions): Promise<number> {
    try {
      const { data } = await this.octokit.repos.createDeployment({
        owner: options.owner,
        repo: options.repo,
        ref: options.ref,
        task: options.task || 'deploy',
        auto_merge: options.auto_merge || false,
        required_contexts: options.required_contexts || [],
        payload: options.payload || {},
        environment: options.environment || 'production',
        description: options.description,
        transient_environment: options.transient_environment || false,
        production_environment: options.production_environment || false,
      });
      
      logger.info('Created deployment', { 
        owner: options.owner, 
        repo: options.repo, 
        environment: options.environment,
        deploymentId: data.id,
      });
      
      MetricsCollector.recordGitHubOperation('create_deployment', 'success');
      return data.id;
    } catch (error) {
      MetricsCollector.recordGitHubOperation('create_deployment', 'failure');
      logger.error('Failed to create deployment:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async updateDeploymentStatus(
    owner: string,
    repo: string,
    deploymentId: number,
    state: 'error' | 'failure' | 'inactive' | 'in_progress' | 'queued' | 'pending' | 'success',
    options?: {
      target_url?: string;
      log_url?: string;
      description?: string;
      environment?: string;
      environment_url?: string;
      auto_inactive?: boolean;
    }
  ): Promise<void> {
    try {
      await this.octokit.repos.createDeploymentStatus({
        owner,
        repo,
        deployment_id: deploymentId,
        state,
        target_url: options?.target_url,
        log_url: options?.log_url,
        description: options?.description,
        environment: options?.environment,
        environment_url: options?.environment_url,
        auto_inactive: options?.auto_inactive,
      });
      
      logger.info('Updated deployment status', { 
        owner, 
        repo, 
        deploymentId, 
        state,
      });
      
      MetricsCollector.recordGitHubOperation('update_deployment_status', 'success');
    } catch (error) {
      MetricsCollector.recordGitHubOperation('update_deployment_status', 'failure');
      logger.error('Failed to update deployment status:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Pull request operations
  public async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    options?: {
      body?: string;
      draft?: boolean;
      maintainer_can_modify?: boolean;
    }
  ): Promise<number> {
    try {
      const { data } = await this.octokit.pulls.create({
        owner,
        repo,
        title,
        head,
        base,
        body: options?.body,
        draft: options?.draft,
        maintainer_can_modify: options?.maintainer_can_modify,
      });
      
      logger.info('Created pull request', { 
        owner, 
        repo, 
        prNumber: data.number,
        title,
      });
      
      MetricsCollector.recordGitHubOperation('create_pr', 'success');
      return data.number;
    } catch (error) {
      MetricsCollector.recordGitHubOperation('create_pr', 'failure');
      logger.error('Failed to create pull request:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getPullRequest(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PullRequest> {
    try {
      const { data } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });
      
      return {
        number: data.number,
        title: data.title,
        state: data.state as PullRequest['state'],
        merged: data.merged || false,
        draft: data.draft || false,
        head: {
          ref: data.head.ref,
          sha: data.head.sha,
        },
        base: {
          ref: data.base.ref,
          sha: data.base.sha,
        },
        user: {
          login: data.user?.login || 'unknown',
        },
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (error) {
      logger.error('Failed to get pull request:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    options?: {
      commit_title?: string;
      commit_message?: string;
      merge_method?: 'merge' | 'squash' | 'rebase';
    }
  ): Promise<void> {
    try {
      await this.octokit.pulls.merge({
        owner,
        repo,
        pull_number: pullNumber,
        commit_title: options?.commit_title,
        commit_message: options?.commit_message,
        merge_method: options?.merge_method || 'merge',
      });
      
      logger.info('Merged pull request', { owner, repo, pullNumber });
      MetricsCollector.recordGitHubOperation('merge_pr', 'success');
    } catch (error) {
      MetricsCollector.recordGitHubOperation('merge_pr', 'failure');
      logger.error('Failed to merge pull request:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Repository operations
  public async createRelease(
    owner: string,
    repo: string,
    tagName: string,
    options?: {
      target_commitish?: string;
      name?: string;
      body?: string;
      draft?: boolean;
      prerelease?: boolean;
      generate_release_notes?: boolean;
    }
  ): Promise<number> {
    try {
      const { data } = await this.octokit.repos.createRelease({
        owner,
        repo,
        tag_name: tagName,
        target_commitish: options?.target_commitish,
        name: options?.name || tagName,
        body: options?.body,
        draft: options?.draft || false,
        prerelease: options?.prerelease || false,
        generate_release_notes: options?.generate_release_notes || false,
      });
      
      logger.info('Created release', { 
        owner, 
        repo, 
        tagName,
        releaseId: data.id,
      });
      
      MetricsCollector.recordGitHubOperation('create_release', 'success');
      return data.id;
    } catch (error) {
      MetricsCollector.recordGitHubOperation('create_release', 'failure');
      logger.error('Failed to create release:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getLatestRelease(owner: string, repo: string): Promise<any> {
    try {
      const { data } = await this.octokit.repos.getLatestRelease({
        owner,
        repo,
      });
      
      return data;
    } catch (error) {
      logger.error('Failed to get latest release:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Webhook operations
  public async createWebhook(
    owner: string,
    repo: string,
    url: string,
    events: string[],
    secret?: string
  ): Promise<number> {
    try {
      const { data } = await this.octokit.repos.createWebhook({
        owner,
        repo,
        config: {
          url,
          content_type: 'json',
          secret: secret || this.webhookSecret,
          insecure_ssl: '0',
        },
        events,
        active: true,
      });
      
      logger.info('Created webhook', { 
        owner, 
        repo, 
        url,
        events,
        webhookId: data.id,
      });
      
      MetricsCollector.recordGitHubOperation('create_webhook', 'success');
      return data.id;
    } catch (error) {
      MetricsCollector.recordGitHubOperation('create_webhook', 'failure');
      logger.error('Failed to create webhook:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public verifyWebhookSignature(
    payload: string,
    signature: string,
    secret?: string
  ): boolean {
    const webhookSecret = secret || this.webhookSecret;
    
    if (!webhookSecret) {
      logger.warn('No webhook secret configured, skipping signature verification');
      return true;
    }

    const hmac = crypto.createHmac('sha256', webhookSecret);
    const digest = `sha256=${hmac.update(payload).digest('hex')}`;
    
    const signatureBuffer = Buffer.from(signature);
    const digestBuffer = Buffer.from(digest);
    
    if (signatureBuffer.length !== digestBuffer.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(signatureBuffer, digestBuffer);
  }

  // Status checks
  public async createCheckRun(
    owner: string,
    repo: string,
    name: string,
    headSha: string,
    options?: {
      status?: 'queued' | 'in_progress' | 'completed';
      conclusion?: 'action_required' | 'cancelled' | 'failure' | 'neutral' | 'success' | 'skipped' | 'timed_out';
      started_at?: string;
      completed_at?: string;
      output?: {
        title: string;
        summary: string;
        text?: string;
        annotations?: Array<{
          path: string;
          start_line: number;
          end_line: number;
          start_column?: number;
          end_column?: number;
          annotation_level: 'notice' | 'warning' | 'failure';
          message: string;
          title?: string;
          raw_details?: string;
        }>;
      };
      actions?: Array<{
        label: string;
        description: string;
        identifier: string;
      }>;
    }
  ): Promise<number> {
    try {
      const { data } = await this.octokit.checks.create({
        owner,
        repo,
        name,
        head_sha: headSha,
        status: options?.status,
        conclusion: options?.conclusion,
        started_at: options?.started_at,
        completed_at: options?.completed_at,
        output: options?.output,
        actions: options?.actions,
      });
      
      logger.info('Created check run', { 
        owner, 
        repo, 
        name,
        checkRunId: data.id,
      });
      
      MetricsCollector.recordGitHubOperation('create_check_run', 'success');
      return data.id;
    } catch (error) {
      MetricsCollector.recordGitHubOperation('create_check_run', 'failure');
      logger.error('Failed to create check run:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async updateCheckRun(
    owner: string,
    repo: string,
    checkRunId: number,
    options: {
      status?: 'queued' | 'in_progress' | 'completed';
      conclusion?: 'action_required' | 'cancelled' | 'failure' | 'neutral' | 'success' | 'skipped' | 'timed_out';
      completed_at?: string;
      output?: {
        title: string;
        summary: string;
        text?: string;
      };
    }
  ): Promise<void> {
    try {
      await this.octokit.checks.update({
        owner,
        repo,
        check_run_id: checkRunId,
        status: options.status,
        conclusion: options.conclusion,
        completed_at: options.completed_at,
        output: options.output,
      });
      
      logger.info('Updated check run', { 
        owner, 
        repo, 
        checkRunId,
        status: options.status,
      });
      
      MetricsCollector.recordGitHubOperation('update_check_run', 'success');
    } catch (error) {
      MetricsCollector.recordGitHubOperation('update_check_run', 'failure');
      logger.error('Failed to update check run:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Branch protection
  public async updateBranchProtection(
    owner: string,
    repo: string,
    branch: string,
    options: {
      required_status_checks?: {
        strict: boolean;
        contexts: string[];
      };
      enforce_admins?: boolean;
      required_pull_request_reviews?: {
        dismissal_restrictions?: {
          users?: string[];
          teams?: string[];
        };
        dismiss_stale_reviews?: boolean;
        require_code_owner_reviews?: boolean;
        required_approving_review_count?: number;
      };
      restrictions?: {
        users: string[];
        teams: string[];
        apps?: string[];
      };
      allow_force_pushes?: boolean;
      allow_deletions?: boolean;
      required_conversation_resolution?: boolean;
    }
  ): Promise<void> {
    try {
      await this.octokit.repos.updateBranchProtection({
        owner,
        repo,
        branch,
        required_status_checks: options.required_status_checks,
        enforce_admins: options.enforce_admins,
        required_pull_request_reviews: options.required_pull_request_reviews,
        restrictions: options.restrictions,
        allow_force_pushes: options.allow_force_pushes,
        allow_deletions: options.allow_deletions,
        required_conversation_resolution: options.required_conversation_resolution,
      });
      
      logger.info('Updated branch protection', { owner, repo, branch });
      MetricsCollector.recordGitHubOperation('update_branch_protection', 'success');
    } catch (error) {
      MetricsCollector.recordGitHubOperation('update_branch_protection', 'failure');
      logger.error('Failed to update branch protection:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Repository secrets
  public async createOrUpdateRepoSecret(
    owner: string,
    repo: string,
    secretName: string,
    encryptedValue: string,
    keyId: string
  ): Promise<void> {
    try {
      await this.octokit.actions.createOrUpdateRepoSecret({
        owner,
        repo,
        secret_name: secretName,
        encrypted_value: encryptedValue,
        key_id: keyId,
      });
      
      logger.info('Created/updated repository secret', { owner, repo, secretName });
      MetricsCollector.recordGitHubOperation('create_repo_secret', 'success');
    } catch (error) {
      MetricsCollector.recordGitHubOperation('create_repo_secret', 'failure');
      logger.error('Failed to create/update repository secret:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getRepoPublicKey(owner: string, repo: string): Promise<{ key_id: string; key: string }> {
    try {
      const { data } = await this.octokit.actions.getRepoPublicKey({
        owner,
        repo,
      });
      
      return {
        key_id: data.key_id,
        key: data.key,
      };
    } catch (error) {
      logger.error('Failed to get repository public key:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}