/**
 * Validators for project management entities
 */

import { UserStory, Epic, AcceptanceCriteria, StoryType } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate user story
 */
export async function validateUserStory(story: UserStory): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!story.title || story.title.trim().length === 0) {
    errors.push('Title is required');
  }

  if (!story.asA || story.asA.trim().length === 0) {
    errors.push('User role (As a...) is required');
  }

  if (!story.iWant || story.iWant.trim().length === 0) {
    errors.push('User need (I want...) is required');
  }

  if (!story.soThat || story.soThat.trim().length === 0) {
    errors.push('Business value (So that...) is required');
  }

  // Validate story format
  if (story.title && story.title.length > 200) {
    errors.push('Title must be less than 200 characters');
  }

  // Validate acceptance criteria
  if (story.acceptanceCriteria.length === 0) {
    warnings.push('No acceptance criteria defined');
  } else {
    for (const criteria of story.acceptanceCriteria) {
      const criteriaValidation = validateAcceptanceCriteria(criteria);
      errors.push(...criteriaValidation.errors);
      warnings.push(...criteriaValidation.warnings);
    }
  }

  // Validate story points
  if (story.storyPoints !== undefined) {
    if (story.storyPoints < 0 || story.storyPoints > 100) {
      errors.push('Story points must be between 0 and 100');
    }
    if (story.type === StoryType.EPIC && story.storyPoints !== undefined) {
      warnings.push('Epics should not have story points directly assigned');
    }
  }

  // Validate dependencies
  if (story.dependencies && story.dependencies.includes(story.id)) {
    errors.push('Story cannot depend on itself');
  }

  // Type-specific validation
  if (story.type === StoryType.EPIC) {
    const epicValidation = validateEpic(story as Epic);
    errors.push(...epicValidation.errors);
    warnings.push(...epicValidation.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validate epic
 */
export function validateEpic(epic: Epic): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (epic.businessValue !== undefined && (epic.businessValue < 0 || epic.businessValue > 100)) {
    errors.push('Business value must be between 0 and 100');
  }

  if (!epic.targetRelease) {
    warnings.push('No target release specified for epic');
  }

  if (!epic.stakeholders || epic.stakeholders.length === 0) {
    warnings.push('No stakeholders identified for epic');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate acceptance criteria
 */
export function validateAcceptanceCriteria(criteria: AcceptanceCriteria): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!criteria.description || criteria.description.trim().length === 0) {
    errors.push('Acceptance criteria description is required');
  }

  if (criteria.description && criteria.description.length > 500) {
    errors.push('Acceptance criteria description must be less than 500 characters');
  }

  if (!criteria.testable) {
    warnings.push(`Acceptance criteria "${criteria.description}" is marked as not testable`);
  }

  if (criteria.testable && (!criteria.testCases || criteria.testCases.length === 0)) {
    warnings.push(`Testable criteria "${criteria.description}" has no test cases`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate story relationships
 */
export function validateStoryRelationships(
  story: UserStory,
  allStories: Map<string, UserStory>
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check parent exists
  if (story.parentId && !allStories.has(story.parentId)) {
    errors.push(`Parent story ${story.parentId} does not exist`);
  }

  // Check children exist
  if (story.childIds) {
    for (const childId of story.childIds) {
      if (!allStories.has(childId)) {
        errors.push(`Child story ${childId} does not exist`);
      }
    }
  }

  // Check for circular dependencies
  if (story.dependencies) {
    const visited = new Set<string>();
    const stack = [...story.dependencies];
    
    while (stack.length > 0) {
      const depId = stack.pop()!;
      if (depId === story.id) {
        errors.push('Circular dependency detected');
        break;
      }
      
      if (visited.has(depId)) continue;
      visited.add(depId);
      
      const depStory = allStories.get(depId);
      if (depStory && depStory.dependencies) {
        stack.push(...depStory.dependencies);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate story completeness for definition of done
 */
export function validateDefinitionOfDone(story: UserStory, dod: any[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const criterion of dod) {
    if (criterion.required) {
      // Check if criterion is met
      const met = checkCriterionMet(story, criterion);
      if (!met) {
        errors.push(`Required DoD criterion not met: ${criterion.description}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function checkCriterionMet(story: UserStory, criterion: any): boolean {
  // Implementation would check various aspects based on criterion type
  // This is a placeholder
  return true;
}