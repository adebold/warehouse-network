const mongoose = require('mongoose');

const integrationConfigSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['string', 'number', 'boolean', 'object', 'array', 'select'],
    required: true
  },
  description: {
    type: String,
    required: true
  },
  required: {
    type: Boolean,
    default: false
  },
  defaultValue: {
    type: mongoose.Schema.Types.Mixed
  },
  validation: {
    min: Number,
    max: Number,
    pattern: String,
    options: [String] // For select type
  },
  sensitive: {
    type: Boolean,
    default: false // For passwords, API keys, etc.
  }
}, { _id: false });

const integrationEndpointSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    required: true
  },
  path: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  parameters: [{
    name: String,
    type: String,
    description: String,
    required: Boolean
  }],
  responses: [{
    statusCode: Number,
    description: String,
    schema: mongoose.Schema.Types.Mixed
  }],
  rateLimit: {
    requests: { type: Number, default: 100 },
    window: { type: Number, default: 3600000 } // 1 hour
  }
}, { _id: false });

const integrationWebhookSchema = new mongoose.Schema({
  event: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  schema: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  example: {
    type: mongoose.Schema.Types.Mixed
  }
}, { _id: false });

const integrationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
    unique: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    validate: {
      validator: (slug) => /^[a-z0-9-]+$/.test(slug),
      message: 'Slug must contain only lowercase letters, numbers, and hyphens'
    }
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  longDescription: {
    type: String,
    maxlength: 5000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'authentication',
      'payment',
      'communication',
      'storage',
      'analytics',
      'monitoring',
      'crm',
      'marketing',
      'ecommerce',
      'social',
      'productivity',
      'developer-tools',
      'database',
      'ai-ml',
      'iot',
      'other'
    ]
  },
  subcategory: {
    type: String,
    trim: true
  },
  version: {
    type: String,
    required: true,
    default: '1.0.0',
    validate: {
      validator: (version) => /^\\d+\\.\\d+\\.\\d+$/.test(version),
      message: 'Version must follow semantic versioning (X.Y.Z)'
    }
  },
  provider: {
    name: {
      type: String,
      required: true
    },
    website: {
      type: String,
      validate: {
        validator: (url) => !url || /^https?:\\/\\/.+/.test(url),
        message: 'Invalid website URL'
      }
    },
    contact: {
      email: String,
      phone: String,
      support: String
    },
    verified: {
      type: Boolean,
      default: false
    }
  },
  logo: {
    type: String,
    validate: {
      validator: (url) => !url || /^https?:\\/\\/.+\\.(jpg|jpeg|png|gif|svg)$/i.test(url),
      message: 'Logo must be a valid image URL'
    }
  },
  screenshots: [{
    type: String,
    validate: {
      validator: (url) => /^https?:\\/\\/.+\\.(jpg|jpeg|png|gif)$/i.test(url),
      message: 'Screenshot must be a valid image URL'
    }
  }],
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 20
  }],
  pricing: {
    model: {
      type: String,
      enum: ['free', 'freemium', 'paid', 'usage-based', 'enterprise'],
      default: 'free'
    },
    plans: [{
      name: String,
      price: Number,
      currency: { type: String, default: 'USD' },
      period: { type: String, enum: ['month', 'year', 'usage'], default: 'month' },
      features: [String],
      limits: {
        requests: Number,
        storage: Number,
        users: Number
      }
    }],
    freeTrialDays: {
      type: Number,
      min: 0,
      max: 365
    }
  },
  configuration: [integrationConfigSchema],
  endpoints: [integrationEndpointSchema],
  webhooks: [integrationWebhookSchema],
  authentication: {
    type: {
      type: String,
      enum: ['none', 'api-key', 'oauth2', 'basic', 'bearer', 'custom'],
      default: 'api-key'
    },
    config: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    scopes: [String], // For OAuth2
    documentation: String
  },
  documentation: {
    readme: String,
    apiReference: String,
    quickStart: String,
    examples: [{
      title: String,
      description: String,
      code: String,
      language: String
    }],
    changelog: String,
    migration: String
  },
  status: {
    type: String,
    enum: ['draft', 'review', 'approved', 'published', 'deprecated', 'retired'],
    default: 'draft'
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'organization'],
    default: 'public'
  },
  featured: {
    type: Boolean,
    default: false
  },
  verified: {
    type: Boolean,
    default: false
  },
  statistics: {
    installs: {
      type: Number,
      default: 0
    },
    activeInstalls: {
      type: Number,
      default: 0
    },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
      distribution: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 }
      }
    },
    lastMonthInstalls: {
      type: Number,
      default: 0
    },
    apiCalls: {
      total: { type: Number, default: 0 },
      lastMonth: { type: Number, default: 0 }
    }
  },
  compatibility: {
    platformVersion: String,
    dependencies: [{
      name: String,
      version: String,
      required: Boolean
    }],
    conflicts: [String]
  },
  security: {
    scanned: {
      type: Boolean,
      default: false
    },
    scanResults: {
      vulnerabilities: [{
        severity: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
        description: String,
        cve: String,
        fixed: { type: Boolean, default: false }
      }],
      lastScanDate: Date,
      score: { type: Number, min: 0, max: 100 }
    },
    permissions: [String],
    dataAccess: [String]
  },
  support: {
    documentation: String,
    forum: String,
    email: String,
    phone: String,
    chat: String,
    hours: String,
    languages: [String],
    sla: {
      responseTime: String,
      uptime: String
    }
  },
  legal: {
    termsOfService: String,
    privacyPolicy: String,
    license: String,
    compliance: [String] // GDPR, HIPAA, SOX, etc.
  },
  metadata: {
    sourceCodeUrl: String,
    issueTrackerUrl: String,
    forumUrl: String,
    downloadUrl: String,
    packageSize: Number,
    lastUpdated: Date,
    releaseNotes: String
  },
  installation: {
    method: {
      type: String,
      enum: ['api', 'webhook', 'plugin', 'sdk'],
      default: 'api'
    },
    instructions: String,
    requirements: [String],
    dependencies: [String],
    postInstallSteps: [String]
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collaborators: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'maintainer', 'contributor'],
      default: 'contributor'
    },
    permissions: [String]
  }],
  audit: {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (doc, ret) => {
      // Remove sensitive configuration values
      if (ret.configuration) {
        ret.configuration = ret.configuration.map(config => {
          if (config.sensitive) {
            return { ...config, defaultValue: '[HIDDEN]' };
          }
          return config;
        });
      }
      return ret;
    }
  }
});

// Indexes
integrationSchema.index({ name: 'text', description: 'text', tags: 'text' });
integrationSchema.index({ category: 1, subcategory: 1 });
integrationSchema.index({ status: 1, visibility: 1 });
integrationSchema.index({ featured: 1, verified: 1 });
integrationSchema.index({ 'statistics.rating.average': -1 });
integrationSchema.index({ 'statistics.installs': -1 });
integrationSchema.index({ 'audit.updatedAt': -1 });
integrationSchema.index({ owner: 1 });
integrationSchema.index({ slug: 1 }, { unique: true });

// Virtual for average rating
integrationSchema.virtual('averageRating').get(function() {
  return this.statistics.rating.average;
});

// Virtual for total ratings
integrationSchema.virtual('totalRatings').get(function() {
  return this.statistics.rating.count;
});

// Virtual for popularity score
integrationSchema.virtual('popularityScore').get(function() {
  const installs = this.statistics.installs || 0;
  const rating = this.statistics.rating.average || 0;
  const ratingCount = this.statistics.rating.count || 0;

  // Weighted popularity score
  return (installs * 0.4) + (rating * ratingCount * 0.6);
});

// Pre-save middleware
integrationSchema.pre('save', function(next) {
  // Generate slug if not provided
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\\s-]/g, '')
      .replace(/\\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  // Update timestamps
  if (this.isModified() && !this.isNew) {
    this.audit.updatedAt = new Date();
  }

  next();
});

// Instance methods
integrationSchema.methods.updateRating = function(newRating, oldRating = null) {
  const stats = this.statistics.rating;

  if (oldRating) {
    // Update existing rating
    stats.distribution[oldRating]--;
    stats.distribution[newRating]++;
  } else {
    // Add new rating
    stats.count++;
    stats.distribution[newRating]++;
  }

  // Recalculate average
  const total = Object.keys(stats.distribution).reduce((sum, rating) => {
    return sum + (parseInt(rating) * stats.distribution[rating]);
  }, 0);

  stats.average = total / stats.count;
};

integrationSchema.methods.incrementInstalls = function() {
  this.statistics.installs++;
  this.statistics.activeInstalls++;
  return this.save();
};

integrationSchema.methods.decrementActiveInstalls = function() {
  this.statistics.activeInstalls = Math.max(0, this.statistics.activeInstalls - 1);
  return this.save();
};

integrationSchema.methods.updateApiCallStats = function(callCount) {
  this.statistics.apiCalls.total += callCount;
  this.statistics.apiCalls.lastMonth += callCount;
  return this.save();
};

integrationSchema.methods.canUserAccess = function(user) {
  // Check visibility
  if (this.visibility === 'private' && !this.owner.equals(user._id)) {
    // Check if user is a collaborator
    const isCollaborator = this.collaborators.some(collab =>
      collab.user.equals(user._id)
    );
    return isCollaborator;
  }

  if (this.visibility === 'organization' && user.organization !== this.owner.organization) {
    return false;
  }

  return true;
};

integrationSchema.methods.canUserManage = function(user) {
  if (this.owner.equals(user._id)) {
    return true;
  }

  const collaborator = this.collaborators.find(collab =>
    collab.user.equals(user._id)
  );

  return collaborator && ['admin', 'maintainer'].includes(collaborator.role);
};

// Static methods
integrationSchema.statics.findByCategory = function(category, subcategory = null) {
  const query = { category, status: 'published', visibility: 'public' };
  if (subcategory) query.subcategory = subcategory;
  return this.find(query);
};

integrationSchema.statics.findFeatured = function() {
  return this.find({
    featured: true,
    status: 'published',
    visibility: 'public'
  }).sort({ 'statistics.rating.average': -1 });
};

integrationSchema.statics.findPopular = function(limit = 10) {
  return this.aggregate([
    {
      $match: {
        status: 'published',
        visibility: 'public'
      }
    },
    {
      $addFields: {
        popularityScore: {
          $add: [
            { $multiply: ['$statistics.installs', 0.4] },
            {
              $multiply: [
                '$statistics.rating.average',
                '$statistics.rating.count',
                0.6
              ]
            }
          ]
        }
      }
    },
    { $sort: { popularityScore: -1 } },
    { $limit: limit }
  ]);
};

integrationSchema.statics.search = function(query, options = {}) {
  const {
    category,
    pricing,
    rating,
    verified,
    limit = 20,
    skip = 0,
    sortBy = 'relevance'
  } = options;

  const searchQuery = {
    $text: { $search: query },
    status: 'published',
    visibility: 'public'
  };

  if (category) searchQuery.category = category;
  if (pricing) searchQuery['pricing.model'] = pricing;
  if (rating) searchQuery['statistics.rating.average'] = { $gte: rating };
  if (verified !== undefined) searchQuery.verified = verified;

  let sort = {};
  switch (sortBy) {
    case 'rating':
      sort = { 'statistics.rating.average': -1 };
      break;
    case 'installs':
      sort = { 'statistics.installs': -1 };
      break;
    case 'updated':
      sort = { 'audit.updatedAt': -1 };
      break;
    default:
      sort = { score: { $meta: 'textScore' } };
  }

  return this.find(searchQuery)
    .sort(sort)
    .limit(limit)
    .skip(skip);
};

const Integration = mongoose.model('Integration', integrationSchema);

module.exports = Integration;