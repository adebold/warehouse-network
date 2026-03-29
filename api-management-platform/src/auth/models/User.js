const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      message: 'Invalid email format'
    }
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false // Don't include in queries by default
  },
  firstName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  organization: {
    type: String,
    trim: true,
    maxlength: 100
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'developer', 'viewer'],
    default: 'user'
  },
  tier: {
    type: String,
    enum: ['free', 'basic', 'premium', 'enterprise'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'pending'
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: {
    type: String,
    select: false
  },
  emailVerificationExpires: {
    type: Date,
    select: false
  },
  passwordResetToken: {
    type: String,
    select: false
  },
  passwordResetExpires: {
    type: Date,
    select: false
  },
  lastLogin: {
    type: Date
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    select: false
  },
  preferences: {
    notifications: {
      email: { type: Boolean, default: true },
      webhook: { type: Boolean, default: false },
      sms: { type: Boolean, default: false }
    },
    dashboard: {
      theme: { type: String, enum: ['light', 'dark'], default: 'light' },
      timezone: { type: String, default: 'UTC' },
      language: { type: String, default: 'en' }
    }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  apiKeys: [{
    name: { type: String, required: true },
    key: { type: String, required: true, unique: true },
    permissions: [{ type: String }],
    rateLimit: {
      requests: { type: Number, default: 1000 },
      window: { type: Number, default: 3600000 } // 1 hour in ms
    },
    lastUsed: { type: Date },
    expiresAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    active: { type: Boolean, default: true }
  }],
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
      delete ret.password;
      delete ret.emailVerificationToken;
      delete ret.passwordResetToken;
      delete ret.twoFactorSecret;
      return ret;
    }
  }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ organization: 1 });
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ 'apiKeys.key': 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return \`\${this.firstName} \${this.lastName}\`.trim();
});

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to update timestamps
userSchema.pre('save', function(next) {
  if (this.isModified() && !this.isNew) {
    this.audit.updatedAt = new Date();
  }
  next();
});

// Instance methods
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

  return token;
};

userSchema.methods.generatePasswordResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 30 * 60 * 1000; // 30 minutes

  return token;
};

userSchema.methods.generateApiKey = function(name, permissions = []) {
  const key = 'ak_' + crypto.randomBytes(32).toString('hex');

  this.apiKeys.push({
    name,
    key,
    permissions,
    createdAt: new Date()
  });

  return key;
};

userSchema.methods.revokeApiKey = function(keyId) {
  const apiKey = this.apiKeys.id(keyId);
  if (apiKey) {
    apiKey.active = false;
    return true;
  }
  return false;
};

userSchema.methods.handleFailedLogin = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { loginAttempts: 1, lockUntil: 1 }
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = {
      lockUntil: Date.now() + 2 * 60 * 60 * 1000 // 2 hours
    };
  }

  return this.updateOne(updates);
};

userSchema.methods.handleSuccessfulLogin = function() {
  if (this.loginAttempts || this.lockUntil) {
    return this.updateOne({
      $unset: { loginAttempts: 1, lockUntil: 1 },
      $set: { lastLogin: Date.now() }
    });
  }

  return this.updateOne({
    $set: { lastLogin: Date.now() }
  });
};

// Static methods
userSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByApiKey = function(apiKey) {
  return this.findOne(
    {
      'apiKeys.key': apiKey,
      'apiKeys.active': true
    },
    {
      'apiKeys.$': 1,
      email: 1,
      firstName: 1,
      lastName: 1,
      role: 1,
      tier: 1,
      status: 1
    }
  );
};

userSchema.statics.getActiveUsers = function() {
  return this.find({ status: 'active' });
};

userSchema.statics.getUsersByRole = function(role) {
  return this.find({ role });
};

userSchema.statics.getUsersByTier = function(tier) {
  return this.find({ tier });
};

const User = mongoose.model('User', userSchema);

module.exports = User;