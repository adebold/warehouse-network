import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '@/utils/logger';

// Generic validation middleware
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Validation failed', {
        endpoint: req.path,
        errors: validationErrors,
        userId: req.user?.id
      });

      res.status(400).json({
        error: 'Validation failed',
        details: validationErrors
      });
      return;
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

// Validation schemas
export const schemas = {
  // Authentication schemas
  register: Joi.object({
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(8).max(128).required(),
    firstName: Joi.string().min(1).max(100).trim().required(),
    lastName: Joi.string().min(1).max(100).trim().required()
  }),

  login: Joi.object({
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().required()
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required()
  }),

  // Campaign schemas
  createCampaign: Joi.object({
    organizationId: Joi.string().uuid().required(),
    name: Joi.string().min(1).max(255).trim().required(),
    description: Joi.string().max(1000).trim().optional(),
    objectives: Joi.object().required(),
    targetAudience: Joi.object().required(),
    budgetTotal: Joi.number().positive().max(1000000).required(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).optional()
  }),

  updateCampaign: Joi.object({
    name: Joi.string().min(1).max(255).trim().optional(),
    description: Joi.string().max(1000).trim().optional(),
    objectives: Joi.object().optional(),
    targetAudience: Joi.object().optional(),
    budgetTotal: Joi.number().positive().max(1000000).optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  }),

  updateCampaignStatus: Joi.object({
    status: Joi.string().valid('draft', 'active', 'paused', 'completed', 'cancelled').required()
  }),

  // Organization schemas
  createOrganization: Joi.object({
    name: Joi.string().min(1).max(255).trim().required(),
    description: Joi.string().max(1000).trim().optional(),
    website: Joi.string().uri().optional(),
    industry: Joi.string().max(100).trim().optional(),
    sizeCategory: Joi.string().valid('startup', 'small', 'medium', 'large', 'enterprise').optional()
  }),

  // Analytics schemas
  trackEvent: Joi.object({
    organizationId: Joi.string().uuid().required(),
    campaignId: Joi.string().uuid().optional(),
    channelId: Joi.string().uuid().optional(),
    eventType: Joi.string().min(1).max(100).required(),
    eventData: Joi.object().required(),
    sessionId: Joi.string().max(255).optional()
  }),

  getMetrics: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).required(),
    metrics: Joi.array().items(Joi.string()).optional()
  }),

  // Content schemas
  createContent: Joi.object({
    organizationId: Joi.string().uuid().required(),
    title: Joi.string().min(1).max(255).trim().required(),
    contentType: Joi.string().valid('image', 'video', 'text', 'document').required(),
    contentData: Joi.object().required(),
    metadata: Joi.object().optional()
  }),

  // Channel integration schemas
  configureChannel: Joi.object({
    organizationId: Joi.string().uuid().required(),
    channelId: Joi.string().uuid().required(),
    credentials: Joi.object().required(),
    configuration: Joi.object().optional(),
    isEnabled: Joi.boolean().default(true)
  }),

  // Lead schemas
  createLead: Joi.object({
    organizationId: Joi.string().uuid().required(),
    campaignId: Joi.string().uuid().optional(),
    channelId: Joi.string().uuid().optional(),
    email: Joi.string().email().lowercase().optional(),
    firstName: Joi.string().max(100).trim().optional(),
    lastName: Joi.string().max(100).trim().optional(),
    company: Joi.string().max(255).trim().optional(),
    phone: Joi.string().max(50).trim().optional(),
    source: Joi.string().max(100).trim().optional(),
    metadata: Joi.object().optional()
  }),

  updateLeadStatus: Joi.object({
    status: Joi.string().valid('new', 'contacted', 'qualified', 'converted', 'rejected').required(),
    score: Joi.number().min(0).max(100).optional()
  })
};

// Parameter validation middleware
export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params);

    if (error) {
      res.status(400).json({
        error: 'Invalid parameters',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
      return;
    }

    req.params = value;
    next();
  };
};

// Query parameter validation middleware
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
      return;
    }

    req.query = value;
    next();
  };
};

// Common parameter schemas
export const paramSchemas = {
  id: Joi.object({
    id: Joi.string().uuid().required()
  }),
  
  campaignId: Joi.object({
    campaignId: Joi.string().uuid().required()
  }),
  
  organizationId: Joi.object({
    organizationId: Joi.string().uuid().required()
  })
};

// Common query schemas
export const querySchemas = {
  pagination: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0)
  }),
  
  dateRange: Joi.object({
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().greater(Joi.ref('startDate')).required()
  }),
  
  search: Joi.object({
    q: Joi.string().min(1).max(255).trim().optional(),
    status: Joi.string().optional(),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  })
};