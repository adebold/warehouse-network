/**
 * GitHub Integration for Project Management
 * Integrates with Claude Flow for enhanced automation
 */

import { Octokit } from '@octokit/rest';
import { UserStory, Epic, StoryStatus, StoryType } from '../core/types';
import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import { logger } from '../../../../../../utils/logger';

export class GitHubIntegration extends EventEmitter {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    super();
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Sync user story to GitHub issue
   */
  async syncStoryToIssue(story: UserStory): Promise<number> {
    const issueData = this.convertStoryToIssue(story);

    try {
      // Check if issue exists
      const existingIssue = await this.findIssueByStoryId(story.id);

      if (existingIssue) {
        // Update existing issue
        const { data } = await this.octokit.issues.update({
          owner: this.owner,
          repo: this.repo,
          issue_number: existingIssue.number,
          ...issueData
        });
        
        this.emit('issue:updated', data, story);
        return data.number;
      } else {
        // Create new issue
        const { data } = await this.octokit.issues.create({
          owner: this.owner,
          repo: this.repo,
          ...issueData
        });

        // Add story ID to issue for tracking
        await this.addStoryIdToIssue(data.number, story.id);
        
        this.emit('issue:created', data, story);
        return data.number;
      }
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Sync GitHub issue to user story
   */
  async syncIssueToStory(issueNumber: number): Promise<Partial<UserStory>> {
    try {
      const { data: issue } = await this.octokit.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      return this.convertIssueToStory(issue);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create project board for epic
   */
  async createEpicProject(epic: Epic): Promise<number> {
    try {
      // Use Claude Flow to orchestrate project creation
      const projectPlan = await this.generateProjectPlan(epic);
      
      const { data: project } = await this.octokit.projects.createForRepo({
        owner: this.owner,
        repo: this.repo,
        name: epic.title,
        body: this.formatEpicDescription(epic)
      });

      // Create columns for workflow states
      const columns = ['Backlog', 'In Progress', 'Review', 'Done'];
      for (const columnName of columns) {
        await this.octokit.projects.createColumn({
          project_id: project.id,
          name: columnName
        });
      }

      this.emit('project:created', project, epic);
      return project.id;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Create pull request from story
   */
  async createPRFromStory(story: UserStory, branchName: string): Promise<number> {
    try {
      // Use Claude Flow to generate PR description
      const prDescription = await this.generatePRDescription(story);

      const { data: pr } = await this.octokit.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: `[${story.id}] ${story.title}`,
        body: prDescription,
        head: branchName,
        base: 'main',
        draft: story.status !== StoryStatus.DONE
      });

      // Link PR to issue
      const issueNumber = await this.findIssueByStoryId(story.id);
      if (issueNumber) {
        await this.linkPRToIssue(pr.number, issueNumber.number);
      }

      this.emit('pr:created', pr, story);
      return pr.number;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Setup automated workflows
   */
  async setupAutomatedWorkflows(): Promise<void> {
    const workflows = [
      {
        name: 'story-validation',
        on: ['issues.opened', 'issues.edited'],
        jobs: ['validate-story-format', 'check-acceptance-criteria']
      },
      {
        name: 'auto-assign',
        on: ['issues.opened'],
        jobs: ['assign-by-expertise', 'notify-team']
      },
      {
        name: 'story-completion',
        on: ['pull_request.closed'],
        jobs: ['update-story-status', 'calculate-metrics']
      }
    ];

    // Create GitHub Actions workflows
    for (const workflow of workflows) {
      await this.createWorkflow(workflow);
    }
  }

  /**
   * Analyze repository for story generation
   */
  async analyzeRepositoryForStories(): Promise<Partial<UserStory>[]> {
    try {
      // Use Claude Flow to analyze repository
      const analysis = await this.runClaudeFlowAnalysis();
      
      // Get code structure
      const { data: tree } = await this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: 'HEAD',
        recursive: 'true'
      });

      // Analyze for missing features
      const suggestedStories = await this.analyzeMissingFeatures(tree.tree);
      
      return suggestedStories;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private convertStoryToIssue(story: UserStory): any {
    const labels = this.getLabelsForStory(story);
    
    const body = `
## User Story
**As a** ${story.asA}
**I want** ${story.iWant}
**So that** ${story.soThat}

## Description
${story.description}

## Acceptance Criteria
${story.acceptanceCriteria.map((ac, i) => 
  `${i + 1}. ${ac.description}${ac.testable ? ' ✓' : ' ✗'}`
).join('\n')}

## Story Points: ${story.storyPoints || 'Not estimated'}
## Priority: ${story.priority}
## Status: ${story.status}

${story.blockers?.length ? `\n## Blockers\n${story.blockers.join('\n')}` : ''}
${story.dependencies?.length ? `\n## Dependencies\n${story.dependencies.join('\n')}` : ''}

---
_Story ID: ${story.id}_
    `;

    return {
      title: story.title,
      body,
      labels,
      assignees: story.assignee ? [story.assignee] : [],
      milestone: story.sprint ? parseInt(story.sprint) : undefined
    };
  }

  private convertIssueToStory(issue: any): Partial<UserStory> {
    // Parse story format from issue body
    const storyMatch = issue.body?.match(/\*\*As a\*\* (.+)\n\*\*I want\*\* (.+)\n\*\*So that\*\* (.+)/);
    const storyIdMatch = issue.body?.match(/_Story ID: (.+)_/);

    return {
      id: storyIdMatch?.[1] || `github-${issue.number}`,
      title: issue.title,
      description: issue.body || '',
      asA: storyMatch?.[1] || '',
      iWant: storyMatch?.[2] || '',
      soThat: storyMatch?.[3] || '',
      status: this.mapIssueStateToStoryStatus(issue.state),
      assignee: issue.assignee?.login,
      labels: issue.labels?.map((l: any) => l.name) || [],
      createdAt: new Date(issue.created_at),
      updatedAt: new Date(issue.updated_at)
    };
  }

  private async findIssueByStoryId(storyId: string): Promise<any> {
    const { data: issues } = await this.octokit.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'all',
      per_page: 100
    });

    return issues.find(issue => issue.body?.includes(`_Story ID: ${storyId}_`));
  }

  private async addStoryIdToIssue(issueNumber: number, storyId: string): Promise<void> {
    const { data: issue } = await this.octokit.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber
    });

    const updatedBody = issue.body + `\n\n---\n_Story ID: ${storyId}_`;

    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: updatedBody
    });
  }

  private getLabelsForStory(story: UserStory): string[] {
    const labels = [...(story.labels || [])];

    // Add type label
    labels.push(`type:${story.type}`);

    // Add priority label
    labels.push(`priority:${story.priority}`);

    // Add status label
    labels.push(`status:${story.status}`);

    // Add story points label
    if (story.storyPoints) {
      labels.push(`points:${story.storyPoints}`);
    }

    return labels;
  }

  private mapIssueStateToStoryStatus(state: string): StoryStatus {
    switch (state) {
      case 'open':
        return StoryStatus.PLANNED;
      case 'closed':
        return StoryStatus.DONE;
      default:
        return StoryStatus.DRAFT;
    }
  }

  private formatEpicDescription(epic: Epic): string {
    return `
## Epic: ${epic.title}

${epic.description}

### Business Value: ${epic.businessValue || 'TBD'}
### Target Release: ${epic.targetRelease || 'TBD'}
### Risk Level: ${epic.riskLevel || 'medium'}

### Stakeholders
${epic.stakeholders?.join(', ') || 'TBD'}
    `;
  }

  private async generateProjectPlan(epic: Epic): Promise<any> {
    // Use Claude Flow to generate project plan
    const command = `npx claude-flow@alpha sparc run planner "Generate project plan for epic: ${epic.title}"`;
    const result = execSync(command, { encoding: 'utf-8' });
    return JSON.parse(result);
  }

  private async generatePRDescription(story: UserStory): Promise<string> {
    // Use Claude Flow to generate comprehensive PR description
    const command = `npx claude-flow@alpha sparc run pr-description "Generate PR description for story: ${story.title}"`;
    const result = execSync(command, { encoding: 'utf-8' });
    
    return `
## Story: ${story.title}

${result}

### Acceptance Criteria
${story.acceptanceCriteria.map((ac, i) => 
  `- [ ] ${ac.description}`
).join('\n')}

### Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

### Documentation
- [ ] Code comments added
- [ ] API documentation updated
- [ ] README updated (if needed)

Closes #${story.id}
    `;
  }

  private async linkPRToIssue(prNumber: number, issueNumber: number): Promise<void> {
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: `Pull request #${prNumber} has been created for this story.`
    });
  }

  private async createWorkflow(workflow: any): Promise<void> {
    // Implementation would create GitHub Actions workflow files
    logger.info(`Creating workflow: ${workflow.name}`);
  }

  private async runClaudeFlowAnalysis(): Promise<any> {
    // Use Claude Flow to analyze repository
    const command = `npx claude-flow@alpha github repo-analyze ${this.owner}/${this.repo}`;
    const result = execSync(command, { encoding: 'utf-8' });
    return JSON.parse(result);
  }

  private async analyzeMissingFeatures(tree: any[]): Promise<Partial<UserStory>[]> {
    // Analyze code structure for missing features
    const suggestions: Partial<UserStory>[] = [];

    // Example: Check for missing tests
    const sourceFiles = tree.filter(f => f.path?.endsWith('.ts') && !f.path.includes('test'));
    const testFiles = tree.filter(f => f.path?.includes('test') || f.path?.includes('spec'));

    for (const sourceFile of sourceFiles) {
      const hasTest = testFiles.some(t => 
        t.path?.includes(sourceFile.path!.replace('.ts', ''))
      );

      if (!hasTest) {
        suggestions.push({
          title: `Add tests for ${sourceFile.path}`,
          type: StoryType.TASK,
          asA: 'developer',
          iWant: `comprehensive tests for ${sourceFile.path}`,
          soThat: 'I can ensure code quality and prevent regressions'
        });
      }
    }

    return suggestions;
  }
}