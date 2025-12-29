/**
 * Project Management Module for Claude DevOps Platform
 * Comprehensive project management with Claude Flow integration
 */

export * from './core/types';
export * from './core/story-manager';
export * from './core/validators';
export * from './core/prisma-validator';
export * from './core/story-driven-development';

export * from './integrations/github-integration';

export * from './quality/quality-gates';

// CLI exports
export { createProjectManagementCommands } from './cli/commands';

// Re-export key classes for convenience
export { StoryManager } from './core/story-manager';
export { PrismaValidator } from './core/prisma-validator';
export { GitHubIntegration } from './integrations/github-integration';
export { QualityGateManager } from './quality/quality-gates';
export { StoryDrivenDevelopment } from './core/story-driven-development';

/**
 * Quick start helper functions
 */

import { StoryManager } from './core/story-manager';
import { QualityGateManager } from './quality/quality-gates';
import { StoryDrivenDevelopment } from './core/story-driven-development';
import { logger } from '../../../../../utils/logger';

/**
 * Create a pre-configured project management system
 */
export function createProjectManagementSystem() {
  return {
    stories: new StoryManager(),
    quality: new QualityGateManager(),
    codegen: new StoryDrivenDevelopment()
  };
}

/**
 * Initialize project management with Claude Flow
 */
export async function initializeWithClaudeFlow() {
  const { execSync } = require('child_process');
  
  try {
    // Initialize Claude Flow swarm for project management
    execSync('npx claude-flow@alpha swarm init --topology hierarchical', { stdio: 'inherit' });
    
    // Spawn project management agents
    const agents = [
      'planner',
      'architect', 
      'coder',
      'tester',
      'reviewer',
      'documenter'
    ];
    
    for (const agent of agents) {
      execSync(`npx claude-flow@alpha agent spawn ${agent}`, { stdio: 'inherit' });
    }
    
    logger.info('✓ Claude Flow project management agents initialized');
  } catch (error) {
    logger.error('Failed to initialize Claude Flow:', error);
  }
}

/**
 * Example: Create a story with AI assistance
 */
export async function createStoryWithAI(description: string) {
  const storyManager = new StoryManager();
  const { execSync } = require('child_process');
  
  try {
    // Use Claude Flow to enhance the story
    const command = `npx claude-flow@alpha sparc run specification "Create user story for: ${description}"`;
    const result = execSync(command, { encoding: 'utf-8' });
    const storyData = JSON.parse(result);
    
    // Create the story
    return await storyManager.createStory(storyData);
  } catch (error) {
    logger.error('Failed to create story with AI:', error);
    throw error;
  }
}