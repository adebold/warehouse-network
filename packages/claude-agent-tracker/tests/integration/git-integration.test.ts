/**
 * Git Integration Tests
 */

import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

import { db, initializeDatabase } from '../../src/database/index.js';
import { redis } from '../../src/database/redis.js';
import { GitIntegration } from '../../src/integrations/git.js';
import { ChangeType } from '../../src/types/index.js';

describe('GitIntegration', () => {
  let tempDir: string;
  let gitIntegration: GitIntegration;

  beforeAll(async () => {
    await initializeDatabase();
    await redis.connect();
    
    // Create temporary directory for git tests
    tempDir = mkdtempSync(join(tmpdir(), 'git-test-'));
    gitIntegration = new GitIntegration(tempDir);
  });

  afterAll(async () => {
    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true });
    await db.close();
    await redis.close();
  });

  beforeEach(async () => {
    // Clean up database
    await db.query('DELETE FROM change_events');
    await redis.invalidatePattern('changes:*');
  });

  describe('Git Repository Management', () => {
    it('should initialize a git repository', async () => {
      await gitIntegration.initialize();
      
      const status = await gitIntegration.getGitStatus();
      expect(status.enabled).toBe(true);
      expect(status.branch).toBeTruthy();
    });

    it('should track file changes', async () => {
      const testFile = join(tempDir, 'test.js');
      writeFileSync(testFile, 'console.log("hello");');

      const change = await gitIntegration.trackChange(
        'agent-123',
        testFile,
        ChangeType.FILE_CREATED,
        'Created test file'
      );

      expect(change.id).toBeTruthy();
      expect(change.agentId).toBe('agent-123');
      expect(change.type).toBe(ChangeType.FILE_CREATED);
      expect(change.path).toBe(testFile);
      expect(change.message).toBe('Created test file');

      // Verify in database
      const result = await db.query(
        'SELECT * FROM change_events WHERE id = $1',
        [change.id]
      );
      expect(result.rows).toHaveLength(1);
    });

    it('should capture file diffs', async () => {
      const testFile = join(tempDir, 'diff-test.js');
      writeFileSync(testFile, 'const x = 1;');

      // Track initial creation
      await gitIntegration.trackChange(
        'agent-456',
        testFile,
        ChangeType.FILE_CREATED
      );

      // Modify file
      writeFileSync(testFile, 'const x = 1;\nconst y = 2;');

      const change = await gitIntegration.trackChange(
        'agent-456',
        testFile,
        ChangeType.FILE_MODIFIED
      );

      expect(change.diff).toBeTruthy();
      expect(change.diff).toContain('const y = 2');
    });

    it('should get change history', async () => {
      // Create multiple changes
      for (let i = 0; i < 5; i++) {
        await gitIntegration.trackChange(
          'agent-789',
          `file-${i}.js`,
          ChangeType.FILE_CREATED,
          `Created file ${i}`
        );
      }

      const history = await gitIntegration.getChangeHistory('agent-789', 3);
      expect(history).toHaveLength(3);
      expect(history[0].agentId).toBe('agent-789');
    });

    it('should cache recent changes in Redis', async () => {
      await gitIntegration.trackChange(
        'agent-cache',
        'cached-file.js',
        ChangeType.FILE_CREATED
      );

      const cached = await redis.lrange('changes:agent-cache', 0, -1);
      expect(cached).toHaveLength(1);
      expect(cached[0].path).toBe('cached-file.js');
    });
  });

  describe('Git Commands', () => {
    it('should create commits', async () => {
      const file1 = join(tempDir, 'commit-test-1.js');
      const file2 = join(tempDir, 'commit-test-2.js');
      
      writeFileSync(file1, 'export const a = 1;');
      writeFileSync(file2, 'export const b = 2;');

      const commitHash = await gitIntegration.createCommit(
        'Test commit message',
        [file1, file2],
        'agent-commit'
      );

      expect(commitHash).toBeTruthy();
      expect(commitHash).toMatch(/^[a-f0-9]+$/);

      // Verify commit was tracked
      const changes = await gitIntegration.getChangeHistory();
      const gitCommit = changes.find(c => c.type === ChangeType.GIT_COMMIT);
      expect(gitCommit).toBeDefined();
      expect(gitCommit?.message).toBe('Test commit message');
    });

    it('should get commit history', async () => {
      // Create a few commits
      for (let i = 0; i < 3; i++) {
        const file = join(tempDir, `history-${i}.js`);
        writeFileSync(file, `// File ${i}`);
        
        await gitIntegration.createCommit(
          `Commit ${i}`,
          [file],
          'agent-history'
        );
      }

      const history = await gitIntegration.getCommitHistory(5);
      expect(history).toBeInstanceOf(Array);
      expect(history.length).toBeGreaterThanOrEqual(3);
      expect(history[0]).toHaveProperty('hash');
      expect(history[0]).toHaveProperty('message');
    });

    it('should get git status', async () => {
      // Create an untracked file
      const untrackedFile = join(tempDir, 'untracked.js');
      writeFileSync(untrackedFile, '// Untracked');

      const status = await gitIntegration.getGitStatus();
      
      expect(status.enabled).toBe(true);
      expect(status.branch).toBeTruthy();
      expect(status.modifiedFiles).toBeInstanceOf(Array);
      
      const untracked = status.modifiedFiles.find(
        f => f.path.includes('untracked.js')
      );
      expect(untracked).toBeDefined();
    });

    it('should handle rollback to commit', async () => {
      // Create initial commit
      const file1 = join(tempDir, 'rollback-test.js');
      writeFileSync(file1, 'const initial = true;');
      const hash1 = await gitIntegration.createCommit(
        'Initial commit',
        [file1],
        'agent-rollback'
      );

      // Create second commit
      writeFileSync(file1, 'const modified = true;');
      await gitIntegration.createCommit(
        'Modified commit',
        [file1],
        'agent-rollback'
      );

      // Rollback to first commit
      await gitIntegration.rollbackToCommit(hash1);

      // Verify file content was rolled back
      const content = require('fs').readFileSync(file1, 'utf8');
      expect(content).toContain('initial');
      expect(content).not.toContain('modified');
    });
  });

  describe('Auto-commit Feature', () => {
    it('should auto-commit when enabled', async () => {
      // Enable auto-commit for this test
      const autoCommitIntegration = new GitIntegration(tempDir);
      (autoCommitIntegration as any).enabled = true;
      
      // Mock config to enable auto-commit
      const originalAutoCommit = require('../../src/config/index.js').default.git.autoCommit;
      require('../../src/config/index.js').default.git.autoCommit = true;

      try {
        const testFile = join(tempDir, 'auto-commit-test.js');
        writeFileSync(testFile, 'auto commit content');

        await autoCommitIntegration.trackChange(
          'agent-auto',
          testFile,
          ChangeType.FILE_CREATED,
          'Auto commit test'
        );

        // Wait for auto-commit
        await new Promise(resolve => setTimeout(resolve, 100));

        const commits = await autoCommitIntegration.getCommitHistory(1);
        expect(commits).toHaveLength(1);
        expect(commits[0].message).toContain('Auto commit test');

      } finally {
        // Restore original config
        require('../../src/config/index.js').default.git.autoCommit = originalAutoCommit;
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle non-git directories gracefully', async () => {
      const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-'));
      const nonGitIntegration = new GitIntegration(nonGitDir);

      try {
        await nonGitIntegration.initialize();
        
        // Should create a new git repo
        const status = await nonGitIntegration.getGitStatus();
        expect(status.enabled).toBe(true);

      } finally {
        rmSync(nonGitDir, { recursive: true, force: true });
      }
    });

    it('should handle file tracking errors', async () => {
      const invalidPath = '/this/path/does/not/exist/file.js';

      // Should not throw, but log error
      const change = await gitIntegration.trackChange(
        'agent-error',
        invalidPath,
        ChangeType.FILE_MODIFIED
      );

      expect(change).toBeDefined();
      expect(change.diff).toBe('');
    });
  });
});