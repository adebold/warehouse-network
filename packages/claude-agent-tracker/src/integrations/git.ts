/**
 * Git integration for change tracking
 */

import { exec } from 'child_process';
import { promisify } from 'util';

import { v4 as uuidv4 } from 'uuid';

import config from '../config/index.js';
import { db } from '../database/index.js';
import { redis } from '../database/redis.js';
import { logger } from '../monitoring/logger.js';
import { ChangeEvent, ChangeType } from '../types/index.js';


const execAsync = promisify(exec);

export class GitIntegration {
  private repoPath: string;
  private enabled: boolean;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.enabled = config.git.enabled;
  }

  async initialize(): Promise<void> {
    if (!this.enabled) {
      logger.info('Git integration disabled');
      return;
    }

    try {
      // Check if it's a git repository
      await execAsync('git rev-parse --git-dir', { cwd: this.repoPath });
      logger.info('Git repository found', { path: this.repoPath });
    } catch (error) {
      logger.warn('Not a git repository, initializing', { path: this.repoPath });
      await execAsync('git init', { cwd: this.repoPath });
    }

    // Configure git
    await this.configureGit();
  }

  private async configureGit(): Promise<void> {
    const { name, email } = config.git.author;
    
    try {
      await execAsync(`git config user.name "${name}"`, { cwd: this.repoPath });
      await execAsync(`git config user.email "${email}"`, { cwd: this.repoPath });
    } catch (error) {
      logger.error('Failed to configure git', { error });
    }
  }

  async trackChange(
    agentId: string,
    filePath: string,
    changeType: ChangeType,
    message?: string
  ): Promise<ChangeEvent> {
    const changeEvent: ChangeEvent = {
      id: uuidv4(),
      agentId,
      timestamp: new Date(),
      type: changeType,
      path: filePath,
      message: message || `${changeType}: ${filePath}`,
      metadata: {}
    };

    try {
      // Get file diff if it's a modification
      if (changeType === ChangeType.FILE_MODIFIED && this.enabled) {
        const diff = await this.getFileDiff(filePath);
        changeEvent.diff = diff;
      }

      // Store in database
      await db.query(`
        INSERT INTO change_events 
        (id, agent_id, type, path, diff, message, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        changeEvent.id,
        changeEvent.agentId,
        changeEvent.type,
        changeEvent.path,
        changeEvent.diff,
        changeEvent.message,
        changeEvent.metadata
      ]);

      // Cache recent changes
      await redis.lpush(`changes:${agentId}`, changeEvent);
      await redis.expire(`changes:${agentId}`, 3600);

      // Auto-commit if enabled
      if (config.git.autoCommit && this.enabled) {
        await this.autoCommit(changeEvent);
      }

      logger.info('Change tracked', {
        agentId,
        type: changeType,
        path: filePath
      });

    } catch (error) {
      logger.error('Failed to track change', {
        agentId,
        path: filePath,
        error
      });
    }

    return changeEvent;
  }

  private async getFileDiff(filePath: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `git diff --no-index /dev/null "${filePath}" || git diff "${filePath}"`,
        { cwd: this.repoPath }
      );
      return stdout;
    } catch (error) {
      // File might be new or git might not be available
      return '';
    }
  }

  private async autoCommit(change: ChangeEvent): Promise<void> {
    try {
      // Stage the file
      await execAsync(`git add "${change.path}"`, { cwd: this.repoPath });

      // Create commit message
      const message = change.message || config.git.commitMessage;
      const fullMessage = `${message}\n\nAgent: ${change.agentId}\nChange ID: ${change.id}`;

      // Commit
      await execAsync(`git commit -m "${fullMessage}"`, { cwd: this.repoPath });

      logger.debug('Auto-commit created', {
        agentId: change.agentId,
        path: change.path
      });

    } catch (error) {
      // Might fail if no changes or other git issues
      logger.debug('Auto-commit skipped', { error });
    }
  }

  async getChangeHistory(
    agentId?: string,
    limit = 100
  ): Promise<ChangeEvent[]> {
    let query = 'SELECT * FROM change_events';
    const params: any[] = [];

    if (agentId) {
      params.push(agentId);
      query += ` WHERE agent_id = $${params.length}`;
    }

    params.push(limit);
    query += ` ORDER BY timestamp DESC LIMIT $${params.length}`;

    const result = await db.query(query, params);

    return result.rows.map((row: any) => ({
      id: row.id,
      agentId: row.agent_id,
      timestamp: row.timestamp,
      type: row.type,
      path: row.path,
      diff: row.diff,
      author: row.author,
      message: row.message,
      metadata: row.metadata
    }));
  }

  async getGitStatus(): Promise<any> {
    if (!this.enabled) {
      return { enabled: false };
    }

    try {
      const [status, branch, remotes] = await Promise.all([
        execAsync('git status --porcelain', { cwd: this.repoPath }),
        execAsync('git branch --show-current', { cwd: this.repoPath }),
        execAsync('git remote -v', { cwd: this.repoPath })
      ]);

      const modifiedFiles = status.stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [status, ...pathParts] = line.trim().split(' ');
          return {
            status,
            path: pathParts.join(' ')
          };
        });

      return {
        enabled: true,
        branch: branch.stdout.trim(),
        modifiedFiles,
        remotes: remotes.stdout.trim().split('\n').filter(line => line.trim())
      };
    } catch (error) {
      logger.error('Failed to get git status', { error });
      throw error;
    }
  }

  async createCommit(
    message: string,
    files: string[],
    agentId: string
  ): Promise<string> {
    if (!this.enabled) {
      throw new Error('Git integration is disabled');
    }

    try {
      // Stage files
      for (const file of files) {
        await execAsync(`git add "${file}"`, { cwd: this.repoPath });
      }

      // Create commit
      const fullMessage = `${message}\n\nCreated by agent: ${agentId}`;
      const { stdout } = await execAsync(
        `git commit -m "${fullMessage}"`,
        { cwd: this.repoPath }
      );

      // Extract commit hash
      const match = stdout.match(/\[[\w\s]+\s+([\w]+)\]/);
      const commitHash = match?.[1] || 'unknown';

      // Track as change event
      await this.trackChange(
        agentId,
        files.join(', '),
        ChangeType.GIT_COMMIT,
        message
      );

      logger.info('Commit created', {
        agentId,
        commitHash,
        files: files.length
      });

      return commitHash;
    } catch (error) {
      logger.error('Failed to create commit', { error });
      throw error;
    }
  }

  async pushChanges(remote?: string, branch?: string): Promise<void> {
    if (!this.enabled) {
      throw new Error('Git integration is disabled');
    }

    const pushRemote = remote || config.git.remote;
    const pushBranch = branch || config.git.branch;

    try {
      await execAsync(
        `git push ${pushRemote} ${pushBranch}`,
        { cwd: this.repoPath }
      );

      logger.info('Changes pushed', {
        remote: pushRemote,
        branch: pushBranch
      });
    } catch (error) {
      logger.error('Failed to push changes', { error });
      throw error;
    }
  }

  async getCommitHistory(limit = 10): Promise<any[]> {
    if (!this.enabled) {
      return [];
    }

    try {
      const { stdout } = await execAsync(
        `git log --oneline -n ${limit}`,
        { cwd: this.repoPath }
      );

      return stdout
        .trim()
        .split('\n')
        .filter(line => line)
        .map(line => {
          const [hash, ...messageParts] = line.split(' ');
          return {
            hash,
            message: messageParts.join(' ')
          };
        });
    } catch (error) {
      logger.error('Failed to get commit history', { error });
      return [];
    }
  }

  async rollbackToCommit(commitHash: string): Promise<void> {
    if (!this.enabled) {
      throw new Error('Git integration is disabled');
    }

    try {
      await execAsync(
        `git reset --hard ${commitHash}`,
        { cwd: this.repoPath }
      );

      logger.info('Rolled back to commit', { commitHash });
    } catch (error) {
      logger.error('Failed to rollback', { commitHash, error });
      throw error;
    }
  }
}

// Singleton instance for the current working directory
export const gitIntegration = new GitIntegration(process.cwd());