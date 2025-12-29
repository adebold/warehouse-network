import { Router, Request, Response } from 'express';
import { CodeQualityService } from '../services/code-quality';
import { authenticateToken } from '../middleware/auth';
import { validateRequest } from '../middleware/validate-request';
import { logger } from '../utils/logger';
import Joi from 'joi';

const router = Router();
const qualityService = CodeQualityService.getInstance();

// Quality check validation schemas
const analyzeSchema = Joi.object({
  projectPath: Joi.string().required(),
  projectId: Joi.string().required(),
  commitHash: Joi.string().optional(),
  branch: Joi.string().optional(),
  compareWithBaseline: Joi.boolean().optional()
});

const qualityGateSchema = Joi.object({
  projectId: Joi.string().required(),
  enableSecurity: Joi.boolean().optional(),
  enableComplexity: Joi.boolean().optional(),
  enableCoverage: Joi.boolean().optional(),
  enableDuplication: Joi.boolean().optional(),
  enablePerformance: Joi.boolean().optional(),
  thresholds: Joi.object({
    minQualityScore: Joi.number().min(0).max(10).optional(),
    maxCyclomaticComplexity: Joi.number().min(1).optional(),
    maxCognitiveComplexity: Joi.number().min(1).optional(),
    minTestCoverage: Joi.number().min(0).max(100).optional(),
    maxDuplicationPercentage: Joi.number().min(0).max(100).optional(),
    maxSecurityIssues: Joi.object({
      critical: Joi.number().min(0).optional(),
      high: Joi.number().min(0).optional(),
      medium: Joi.number().min(0).optional(),
      low: Joi.number().min(0).optional()
    }).optional(),
    performance: Joi.object({
      maxBundleSize: Joi.number().min(1).optional(),
      maxLoadTime: Joi.number().min(1).optional(),
      maxMemoryUsage: Joi.number().min(1).optional()
    }).optional()
  }).optional()
});

/**
 * GET /api/quality/health
 * Quality service health check
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    service: 'code-quality',
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/quality/analyze
 * Run quality analysis for a project
 */
router.post(
  '/analyze',
  authenticateToken,
  validateRequest(analyzeSchema),
  async (req: Request, res: Response) => {
    try {
      const { projectPath, projectId, ...options } = req.body;
      
      logger.info('Starting quality analysis', { projectId, projectPath });
      
      const qualityCheck = await qualityService.analyzeForDeployment(
        projectPath,
        projectId,
        options
      );
      
      const report = await qualityService.generateDeploymentReport(qualityCheck);
      
      res.json({
        success: true,
        checkId: qualityCheck.id,
        passed: qualityCheck.passed,
        score: qualityCheck.score,
        blockers: qualityCheck.blockers,
        report
      });
    } catch (error) {
      logger.error('Quality analysis failed', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Quality analysis failed'
      });
    }
  }
);

/**
 * GET /api/quality/check/:checkId
 * Get quality check details
 */
router.get(
  '/check/:checkId',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { checkId } = req.params;
      
      // In a real implementation, we would fetch from database
      res.json({
        success: true,
        message: 'Quality check details would be fetched from database'
      });
    } catch (error) {
      logger.error('Failed to get quality check', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        success: false,
        error: 'Failed to get quality check details'
      });
    }
  }
);

/**
 * POST /api/quality/gate/configure
 * Configure quality gates for a project
 */
router.post(
  '/gate/configure',
  authenticateToken,
  validateRequest(qualityGateSchema),
  async (req: Request, res: Response) => {
    try {
      const { projectId, ...config } = req.body;
      
      qualityService.configureQualityGate(projectId, config);
      
      res.json({
        success: true,
        message: 'Quality gate configured successfully',
        projectId
      });
    } catch (error) {
      logger.error('Failed to configure quality gate', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        success: false,
        error: 'Failed to configure quality gate'
      });
    }
  }
);

/**
 * POST /api/quality/deploy/check
 * Check if deployment should be allowed
 */
router.post(
  '/deploy/check',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { projectId, projectPath, force, ignoreBlockers } = req.body;
      
      const result = await qualityService.canDeploy(
        projectId,
        projectPath,
        { force, ignoreBlockers }
      );
      
      res.json({
        success: true,
        allowed: result.allowed,
        reason: result.reason,
        qualityCheck: result.check ? {
          id: result.check.id,
          score: result.check.score,
          passed: result.check.passed,
          blockers: result.check.blockers
        } : undefined
      });
    } catch (error) {
      logger.error('Deployment check failed', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        success: false,
        error: 'Deployment check failed'
      });
    }
  }
);

/**
 * GET /api/quality/trends/:projectId
 * Get quality trends for a project
 */
router.get(
  '/trends/:projectId',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      const { period = 'week' } = req.query;
      
      const trends = await qualityService.getQualityTrends(
        projectId,
        period as 'day' | 'week' | 'month'
      );
      
      res.json({
        success: true,
        trends
      });
    } catch (error) {
      logger.error('Failed to get quality trends', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        success: false,
        error: 'Failed to get quality trends'
      });
    }
  }
);

/**
 * POST /api/quality/rollback/setup
 * Setup rollback triggers based on quality
 */
router.post(
  '/rollback/setup',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { projectId, deploymentId, thresholds } = req.body;
      
      await qualityService.setupRollbackTriggers(
        projectId,
        deploymentId,
        thresholds
      );
      
      res.json({
        success: true,
        message: 'Rollback triggers configured',
        projectId,
        deploymentId
      });
    } catch (error) {
      logger.error('Failed to setup rollback triggers', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        success: false,
        error: 'Failed to setup rollback triggers'
      });
    }
  }
);

/**
 * POST /api/quality/rollback/check
 * Check if rollback is needed
 */
router.post(
  '/rollback/check',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { projectId, deploymentId, currentPath } = req.body;
      
      const result = await qualityService.checkRollbackNeeded(
        projectId,
        deploymentId,
        currentPath
      );
      
      res.json({
        success: true,
        rollbackNeeded: result.needed,
        reason: result.reason
      });
    } catch (error) {
      logger.error('Failed to check rollback need', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        success: false,
        error: 'Failed to check rollback need'
      });
    }
  }
);

/**
 * GET /api/quality/dashboard/:projectId
 * Get quality dashboard data
 */
router.get(
  '/dashboard/:projectId',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const { projectId } = req.params;
      
      // Get latest quality check
      // In real implementation, this would fetch from database
      const latestCheck = {
        score: 8.5,
        passed: true,
        blockers: [],
        timestamp: new Date()
      };
      
      // Get trends
      const trends = await qualityService.getQualityTrends(projectId, 'week');
      
      res.json({
        success: true,
        dashboard: {
          projectId,
          latestCheck,
          trends,
          summary: {
            averageScore: 8.2,
            totalChecks: 42,
            passRate: 90.5,
            commonIssues: [
              { type: 'complexity', count: 12 },
              { type: 'coverage', count: 8 },
              { type: 'security', count: 3 }
            ]
          }
        }
      });
    } catch (error) {
      logger.error('Failed to get dashboard data', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard data'
      });
    }
  }
);

/**
 * GET /api/quality/metrics
 * Get aggregated quality metrics
 */
router.get(
  '/metrics',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      // In real implementation, this would aggregate from database
      const metrics = {
        totalProjects: 25,
        averageQualityScore: 8.1,
        totalChecksToday: 156,
        failureRate: 12.5,
        topIssues: [
          { type: 'High Cyclomatic Complexity', percentage: 28 },
          { type: 'Low Test Coverage', percentage: 22 },
          { type: 'Security Vulnerabilities', percentage: 15 },
          { type: 'Code Duplication', percentage: 18 },
          { type: 'Performance Issues', percentage: 17 }
        ],
        scoreDistribution: {
          excellent: 35, // 9-10
          good: 40,      // 7-9
          fair: 20,      // 5-7
          poor: 5        // <5
        }
      };
      
      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      logger.error('Failed to get quality metrics', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        success: false,
        error: 'Failed to get quality metrics'
      });
    }
  }
);

export default router;