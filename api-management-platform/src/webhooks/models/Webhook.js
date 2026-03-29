const mongoose = require('mongoose');
const crypto = require('crypto');

const webhookRetryPolicySchema = new mongoose.Schema({
  maxAttempts: {
    type: Number,
    default: 3,
    min: 1,
    max: 10
  },
  backoffMultiplier: {
    type: Number,
    default: 2.0,
    min: 1.0,
    max: 5.0
  },
  initialDelay: {
    type: Number,
    default: 1000, // 1 second
    min: 100,
    max: 60000
  },
  maxDelay: {
    type: Number,
    default: 300000, // 5 minutes
    min: 1000,
    max: 3600000
  }
});

const webhookHeaderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  value: {
    type: String,
    required: true
  }
}, { _id: false });

const webhookSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  url: {
    type: String,
    required: true,
    validate: {
      validator: (url) => {
        try {
          const urlObj = new URL(url);
          return ['http:', 'https:'].includes(urlObj.protocol);
        } catch {
          return false;
        }
      },
      message: 'Invalid URL format'
    }
  },
  events: [{
    type: String,
    required: true,
    enum: [
      // API events
      'api.created',
      'api.updated',
      'api.deleted',
      'api.version.published',
      'api.version.deprecated',

      // User events
      'user.registered',
      'user.login',
      'user.logout',
      'user.updated',
      'user.deleted',

      // Authentication events
      'auth.login.success',
      'auth.login.failed',
      'auth.logout',
      'auth.token.expired',
      'auth.password.changed',

      // API usage events
      'api.request',
      'api.request.success',
      'api.request.error',
      'api.rate_limit.exceeded',

      // System events
      'system.maintenance.start',
      'system.maintenance.end',
      'system.error',
      'system.health.degraded',

      // Integration events
      'integration.installed',
      'integration.uninstalled',
      'integration.error',

      // Billing events
      'billing.subscription.created',
      'billing.subscription.updated',
      'billing.subscription.cancelled',
      'billing.invoice.created',
      'billing.payment.succeeded',
      'billing.payment.failed'
    ]
  }],
  active: {
    type: Boolean,
    default: true
  },
  secret: {
    type: String,
    default: () => crypto.randomBytes(32).toString('hex'),
    select: false // Don't include in queries by default
  },
  headers: [webhookHeaderSchema],
  retryPolicy: {
    type: webhookRetryPolicySchema,
    default: () => ({})
  },
  timeout: {
    type: Number,
    default: 30000, // 30 seconds
    min: 1000,
    max: 300000
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 50
  }],
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  statistics: {
    totalDeliveries: {
      type: Number,
      default: 0
    },
    successfulDeliveries: {
      type: Number,
      default: 0
    },
    failedDeliveries: {
      type: Number,
      default: 0
    },
    lastDelivery: {
      type: Date
    },
    lastSuccess: {
      type: Date
    },
    lastFailure: {
      type: Date
    },
    averageResponseTime: {
      type: Number,
      default: 0
    }
  },
  rateLimiting: {
    enabled: {
      type: Boolean,
      default: false
    },
    requests: {
      type: Number,
      default: 100
    },
    window: {
      type: Number,
      default: 3600000 // 1 hour
    }
  },
  ipWhitelist: [{
    type: String,
    validate: {
      validator: (ip) => {
        // Basic IP validation (IPv4 and IPv6)
        const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        return ipv4Regex.test(ip) || ipv6Regex.test(ip) || ip === '*';
      },
      message: 'Invalid IP address format'
    }
  }],
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  audit: {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      delete ret.secret; // Hide secret in JSON output
      return ret;
    }
  }
});

// Indexes
webhookSchema.index({ owner: 1 });
webhookSchema.index({ events: 1 });
webhookSchema.index({ active: 1 });
webhookSchema.index({ 'audit.createdAt': -1 });
webhookSchema.index({ tags: 1 });

// Virtual for success rate
webhookSchema.virtual('successRate').get(function() {
  if (this.statistics.totalDeliveries === 0) return 0;
  return (this.statistics.successfulDeliveries / this.statistics.totalDeliveries) * 100;
});

// Virtual for failure rate
webhookSchema.virtual('failureRate').get(function() {
  if (this.statistics.totalDeliveries === 0) return 0;
  return (this.statistics.failedDeliveries / this.statistics.totalDeliveries) * 100;
});

// Virtual for health status
webhookSchema.virtual('healthStatus').get(function() {
  if (this.statistics.totalDeliveries === 0) return 'unknown';

  const successRate = this.successRate;
  if (successRate >= 95) return 'healthy';
  if (successRate >= 80) return 'warning';
  return 'unhealthy';
});

// Pre-save middleware to update timestamps
webhookSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.audit.updatedAt = new Date();
  }
  next();
});

// Instance methods
webhookSchema.methods.generateSecret = function() {
  this.secret = crypto.randomBytes(32).toString('hex');
  return this.secret;
};

webhookSchema.methods.rotateSecret = function() {
  const oldSecret = this.secret;
  this.generateSecret();

  // Log secret rotation for audit
  console.log(\`Secret rotated for webhook \${this._id}\`);

  return {
    oldSecret,
    newSecret: this.secret
  };
};

webhookSchema.methods.updateStatistics = function(success, responseTime) {
  this.statistics.totalDeliveries++;
  this.statistics.lastDelivery = new Date();

  if (success) {
    this.statistics.successfulDeliveries++;
    this.statistics.lastSuccess = new Date();
  } else {
    this.statistics.failedDeliveries++;
    this.statistics.lastFailure = new Date();
  }

  // Update average response time
  if (responseTime) {
    const currentAvg = this.statistics.averageResponseTime || 0;
    const totalDeliveries = this.statistics.totalDeliveries;
    this.statistics.averageResponseTime =
      ((currentAvg * (totalDeliveries - 1)) + responseTime) / totalDeliveries;
  }
};

webhookSchema.methods.isHealthy = function(threshold = 80) {
  return this.successRate >= threshold;
};

webhookSchema.methods.shouldRetry = function(attemptNumber) {
  return attemptNumber < this.retryPolicy.maxAttempts;
};

webhookSchema.methods.calculateRetryDelay = function(attemptNumber) {
  const { initialDelay, backoffMultiplier, maxDelay } = this.retryPolicy;
  const delay = Math.min(
    initialDelay * Math.pow(backoffMultiplier, attemptNumber - 1),
    maxDelay
  );

  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.1 * delay;
  return Math.floor(delay + jitter);
};

webhookSchema.methods.validateEvent = function(eventType) {
  return this.events.includes(eventType);
};

webhookSchema.methods.canReceiveEvent = function(eventType, sourceIP = null) {
  // Check if webhook is active
  if (!this.active) return false;

  // Check if event type is supported
  if (!this.validateEvent(eventType)) return false;

  // Check IP whitelist if configured
  if (this.ipWhitelist.length > 0 && sourceIP) {
    const isWhitelisted = this.ipWhitelist.includes('*') ||
                         this.ipWhitelist.includes(sourceIP);
    if (!isWhitelisted) return false;
  }

  return true;
};

// Static methods
webhookSchema.statics.findByEvent = function(eventType) {
  return this.find({
    events: eventType,
    active: true
  });
};

webhookSchema.statics.findByOwner = function(ownerId) {
  return this.find({ owner: ownerId });
};

webhookSchema.statics.getHealthyWebhooks = function(threshold = 80) {
  return this.aggregate([
    {
      $addFields: {
        successRate: {
          $cond: {
            if: { $eq: ['$statistics.totalDeliveries', 0] },
            then: 0,
            else: {
              $multiply: [
                { $divide: ['$statistics.successfulDeliveries', '$statistics.totalDeliveries'] },
                100
              ]
            }
          }
        }
      }
    },
    {
      $match: {
        active: true,
        successRate: { $gte: threshold }
      }
    }
  ]);
};

webhookSchema.statics.getUnhealthyWebhooks = function(threshold = 80) {
  return this.aggregate([
    {
      $addFields: {
        successRate: {
          $cond: {
            if: { $eq: ['$statistics.totalDeliveries', 0] },
            then: 100, // New webhooks are considered healthy
            else: {
              $multiply: [
                { $divide: ['$statistics.successfulDeliveries', '$statistics.totalDeliveries'] },
                100
              ]
            }
          }
        }
      }
    },
    {
      $match: {
        active: true,
        successRate: { $lt: threshold },
        'statistics.totalDeliveries': { $gt: 0 }
      }
    }
  ]);
};

const Webhook = mongoose.model('Webhook', webhookSchema);

module.exports = Webhook;