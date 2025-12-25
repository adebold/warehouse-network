/**
 * User Story Management System
 */

import { UserStory, Epic, StoryType, StoryStatus, AcceptanceCriteria, TestCase } from './types';
import { validateUserStory } from './validators';
import { EventEmitter } from 'events';

export class StoryManager extends EventEmitter {
  private stories: Map<string, UserStory | Epic> = new Map();
  private epics: Map<string, Epic> = new Map();

  /**
   * Create a new user story
   */
  async createStory(data: Partial<UserStory>): Promise<UserStory> {
    const story: UserStory = {
      id: this.generateId(),
      title: data.title || '',
      description: data.description || '',
      asA: data.asA || '',
      iWant: data.iWant || '',
      soThat: data.soThat || '',
      type: data.type || StoryType.STORY,
      status: data.status || StoryStatus.DRAFT,
      priority: data.priority || 'medium',
      acceptanceCriteria: data.acceptanceCriteria || [],
      reporter: data.reporter || 'system',
      labels: data.labels || [],
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    };

    // Validate story
    const validation = await validateUserStory(story);
    if (!validation.valid) {
      throw new Error(`Invalid user story: ${validation.errors.join(', ')}`);
    }

    // Handle parent-child relationships
    if (story.parentId) {
      const parent = this.stories.get(story.parentId);
      if (parent) {
        parent.childIds = parent.childIds || [];
        parent.childIds.push(story.id);
        this.stories.set(parent.id, parent);
      }
    }

    this.stories.set(story.id, story);
    this.emit('story:created', story);
    return story;
  }

  /**
   * Create an epic
   */
  async createEpic(data: Partial<Epic>): Promise<Epic> {
    const epic: Epic = {
      ...(await this.createStory({ ...data, type: StoryType.EPIC })) as Epic,
      targetRelease: data.targetRelease,
      businessValue: data.businessValue,
      riskLevel: data.riskLevel || 'medium',
      stakeholders: data.stakeholders || []
    };

    this.epics.set(epic.id, epic);
    this.emit('epic:created', epic);
    return epic;
  }

  /**
   * Update a story
   */
  async updateStory(id: string, updates: Partial<UserStory>): Promise<UserStory> {
    const story = this.stories.get(id);
    if (!story) {
      throw new Error(`Story ${id} not found`);
    }

    const updatedStory = {
      ...story,
      ...updates,
      updatedAt: new Date()
    };

    // Validate updated story
    const validation = await validateUserStory(updatedStory);
    if (!validation.valid) {
      throw new Error(`Invalid user story: ${validation.errors.join(', ')}`);
    }

    // Handle status transitions
    if (updates.status && updates.status !== story.status) {
      await this.validateStatusTransition(story, updates.status);
      if (updates.status === StoryStatus.DONE) {
        updatedStory.completedAt = new Date();
      }
    }

    this.stories.set(id, updatedStory);
    this.emit('story:updated', updatedStory, story);
    return updatedStory;
  }

  /**
   * Add acceptance criteria to a story
   */
  async addAcceptanceCriteria(storyId: string, criteria: AcceptanceCriteria): Promise<UserStory> {
    const story = this.stories.get(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }

    criteria.id = criteria.id || this.generateId();
    story.acceptanceCriteria.push(criteria);
    
    return this.updateStory(storyId, { acceptanceCriteria: story.acceptanceCriteria });
  }

  /**
   * Add test case to acceptance criteria
   */
  async addTestCase(
    storyId: string, 
    criteriaId: string, 
    testCase: TestCase
  ): Promise<UserStory> {
    const story = this.stories.get(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }

    const criteria = story.acceptanceCriteria.find(c => c.id === criteriaId);
    if (!criteria) {
      throw new Error(`Acceptance criteria ${criteriaId} not found`);
    }

    testCase.id = testCase.id || this.generateId();
    testCase.status = testCase.status || 'pending';
    criteria.testCases = criteria.testCases || [];
    criteria.testCases.push(testCase);

    return this.updateStory(storyId, { acceptanceCriteria: story.acceptanceCriteria });
  }

  /**
   * Estimate story points
   */
  async estimateStoryPoints(storyId: string, points: number): Promise<UserStory> {
    const story = this.stories.get(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }

    if (points < 0 || points > 100) {
      throw new Error('Story points must be between 0 and 100');
    }

    return this.updateStory(storyId, { storyPoints: points });
  }

  /**
   * Assign story to sprint
   */
  async assignToSprint(storyId: string, sprintId: string): Promise<UserStory> {
    const story = this.stories.get(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }

    if (story.status === StoryStatus.DONE) {
      throw new Error('Cannot assign completed stories to sprint');
    }

    return this.updateStory(storyId, { sprint: sprintId });
  }

  /**
   * Get story hierarchy
   */
  getStoryHierarchy(epicId: string): any {
    const epic = this.epics.get(epicId);
    if (!epic) {
      throw new Error(`Epic ${epicId} not found`);
    }

    return this.buildHierarchy(epic);
  }

  /**
   * Get stories by criteria
   */
  getStoriesByFilter(filter: {
    status?: StoryStatus;
    type?: StoryType;
    sprint?: string;
    assignee?: string;
    priority?: string;
  }): UserStory[] {
    return Array.from(this.stories.values()).filter(story => {
      if (filter.status && story.status !== filter.status) return false;
      if (filter.type && story.type !== filter.type) return false;
      if (filter.sprint && story.sprint !== filter.sprint) return false;
      if (filter.assignee && story.assignee !== filter.assignee) return false;
      if (filter.priority && story.priority !== filter.priority) return false;
      return true;
    });
  }

  /**
   * Calculate story metrics
   */
  async calculateStoryMetrics(storyId: string): Promise<any> {
    const story = this.stories.get(storyId);
    if (!story) {
      throw new Error(`Story ${storyId} not found`);
    }

    const metrics = {
      completionRate: this.calculateCompletionRate(story),
      testCoverage: await this.calculateTestCoverage(story),
      acceptanceCriteriaProgress: this.calculateAcceptanceCriteriaProgress(story),
      childProgress: story.childIds ? this.calculateChildProgress(story.childIds) : null
    };

    return metrics;
  }

  /**
   * Generate story from template
   */
  async generateFromTemplate(templateId: string, data: any): Promise<UserStory> {
    // This would load template and apply it
    const template = await this.loadTemplate(templateId);
    const storyData = this.applyTemplate(template, data);
    return this.createStory(storyData);
  }

  private generateId(): string {
    return `story-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async validateStatusTransition(story: UserStory, newStatus: StoryStatus): Promise<void> {
    const transitions: Record<StoryStatus, StoryStatus[]> = {
      [StoryStatus.DRAFT]: [StoryStatus.PLANNED, StoryStatus.BLOCKED],
      [StoryStatus.PLANNED]: [StoryStatus.IN_PROGRESS, StoryStatus.BLOCKED],
      [StoryStatus.IN_PROGRESS]: [StoryStatus.REVIEW, StoryStatus.BLOCKED],
      [StoryStatus.REVIEW]: [StoryStatus.TESTING, StoryStatus.IN_PROGRESS, StoryStatus.BLOCKED],
      [StoryStatus.TESTING]: [StoryStatus.DONE, StoryStatus.REVIEW, StoryStatus.BLOCKED],
      [StoryStatus.DONE]: [],
      [StoryStatus.BLOCKED]: [StoryStatus.PLANNED, StoryStatus.IN_PROGRESS]
    };

    const allowedTransitions = transitions[story.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new Error(`Invalid status transition from ${story.status} to ${newStatus}`);
    }

    // Additional validation for DONE status
    if (newStatus === StoryStatus.DONE) {
      await this.validateCompletionCriteria(story);
    }
  }

  private async validateCompletionCriteria(story: UserStory): Promise<void> {
    // Check if all acceptance criteria are met
    const unmetCriteria = story.acceptanceCriteria.filter(criteria => {
      if (!criteria.testCases || criteria.testCases.length === 0) return true;
      return criteria.testCases.some(tc => tc.status !== 'passed');
    });

    if (unmetCriteria.length > 0) {
      throw new Error(`Cannot complete story: ${unmetCriteria.length} acceptance criteria not met`);
    }

    // Check if all child stories are complete
    if (story.childIds && story.childIds.length > 0) {
      const incompleteChildren = story.childIds.filter(id => {
        const child = this.stories.get(id);
        return child && child.status !== StoryStatus.DONE;
      });

      if (incompleteChildren.length > 0) {
        throw new Error(`Cannot complete story: ${incompleteChildren.length} child stories not complete`);
      }
    }
  }

  private buildHierarchy(story: UserStory | Epic): any {
    const children = (story.childIds || []).map(id => {
      const child = this.stories.get(id);
      return child ? this.buildHierarchy(child) : null;
    }).filter(Boolean);

    return {
      ...story,
      children
    };
  }

  private calculateCompletionRate(story: UserStory): number {
    const totalCriteria = story.acceptanceCriteria.length;
    if (totalCriteria === 0) return 0;

    const completedCriteria = story.acceptanceCriteria.filter(criteria => {
      if (!criteria.testCases) return false;
      return criteria.testCases.every(tc => tc.status === 'passed');
    }).length;

    return (completedCriteria / totalCriteria) * 100;
  }

  private async calculateTestCoverage(story: UserStory): Promise<number> {
    // This would integrate with test coverage tools
    return 0; // Placeholder
  }

  private calculateAcceptanceCriteriaProgress(story: UserStory): any {
    const total = story.acceptanceCriteria.length;
    const automated = story.acceptanceCriteria.filter(c => c.automated).length;
    const withTests = story.acceptanceCriteria.filter(c => c.testCases && c.testCases.length > 0).length;

    return {
      total,
      automated,
      withTests,
      automationRate: total > 0 ? (automated / total) * 100 : 0,
      testCoverageRate: total > 0 ? (withTests / total) * 100 : 0
    };
  }

  private calculateChildProgress(childIds: string[]): any {
    const children = childIds.map(id => this.stories.get(id)).filter(Boolean) as UserStory[];
    const total = children.length;
    const completed = children.filter(c => c.status === StoryStatus.DONE).length;
    const inProgress = children.filter(c => c.status === StoryStatus.IN_PROGRESS).length;
    const blocked = children.filter(c => c.status === StoryStatus.BLOCKED).length;

    return {
      total,
      completed,
      inProgress,
      blocked,
      completionRate: total > 0 ? (completed / total) * 100 : 0
    };
  }

  private async loadTemplate(templateId: string): Promise<any> {
    // Template loading logic
    return {};
  }

  private applyTemplate(template: any, data: any): Partial<UserStory> {
    // Template application logic
    return {};
  }
}