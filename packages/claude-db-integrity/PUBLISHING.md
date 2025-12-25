# Claude DB Integrity - Publishing Guide

## 📦 Publishing Instructions

### Prerequisites

1. **Node.js**: Version 18.0.0 or higher
2. **npm**: Version 9.0.0 or higher
3. **npm account**: Registered at npmjs.com with 2FA enabled
4. **Access**: Must be member of @claude-db-integrity organization (for scoped packages)

### Initial Setup

```bash
# 1. Clone and setup
git clone https://github.com/warehouse-network/claude-db-integrity.git
cd claude-db-integrity/packages/claude-db-integrity

# 2. Install dependencies
npm install

# 3. Build and test
npm run build
npm run test
npm run typecheck

# 4. Verify package contents
npm run publish:dry
```

### Version Management

```bash
# Patch release (bug fixes)
npm run version:patch

# Minor release (new features)
npm run version:minor  

# Major release (breaking changes)
npm run version:major
```

### Publishing Process

#### 1. Beta Release
```bash
# For testing new features
npm run publish:beta
npm install claude-db-integrity@beta
```

#### 2. Production Release
```bash
# Final production release
npm run publish:latest
```

#### 3. Automated Publishing (Recommended)

Set up GitHub Actions for automated publishing:

```yaml
# .github/workflows/publish.yml
name: Publish Package
on:
  release:
    types: [published]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Quality Checks

Before publishing, ensure:

- ✅ All tests pass: `npm test`
- ✅ TypeScript compiles: `npm run typecheck`
- ✅ Linting passes: `npm run lint`
- ✅ Documentation is updated
- ✅ CHANGELOG.md is updated
- ✅ Version is bumped correctly
- ✅ Examples work with new version

### Post-Publishing

1. **Verify Installation**:
   ```bash
   npm install claude-db-integrity@latest
   ```

2. **Update Documentation**:
   ```bash
   npm run docs:generate
   git add docs/api && git commit -m "docs: update API docs"
   ```

3. **Test Examples**:
   ```bash
   npm run examples:test
   ```

4. **Announce Release**:
   - GitHub release notes
   - Discord community
   - Twitter/social media

## 🚀 Quick Publishing Checklist

- [ ] Code review completed
- [ ] Tests added for new features
- [ ] Documentation updated
- [ ] Version bumped appropriately
- [ ] CHANGELOG.md updated
- [ ] Dependencies are up to date
- [ ] Security audit clean: `npm audit`
- [ ] Bundle size acceptable: `npm run publish:dry`
- [ ] Examples tested with new version
- [ ] Backwards compatibility verified
- [ ] Breaking changes documented

## 📊 Package Analytics

Monitor package performance:

- **npm stats**: https://npm-stat.com/charts.html?package=claude-db-integrity
- **bundlephobia**: https://bundlephobia.com/package/claude-db-integrity
- **npm trends**: https://npmtrends.com/claude-db-integrity

## 🔒 Security

### npm Security Best Practices

1. **Enable 2FA**: `npm profile enable-2fa auth-and-writes`
2. **Review permissions**: `npm access list packages`
3. **Audit dependencies**: `npm audit --audit-level=high`
4. **Sign releases**: Use GitHub's verified commits

### Vulnerability Response

1. **Report**: security@claude-db-integrity.com
2. **Patch**: Critical fixes within 24 hours
3. **Notify**: Users via GitHub Security Advisories
4. **Document**: In SECURITY.md

## 🛠 Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clear cache and rebuild
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run build
```

#### TypeScript Errors
```bash
# Check configuration
npm run typecheck
# Fix or ignore specific errors in tsconfig.json
```

#### Test Failures
```bash
# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:coverage
```

#### Publishing Errors
```bash
# Check npm login
npm whoami

# Verify package.json
npm run publish:dry

# Check registry
npm config get registry
```

### Support Channels

- **Issues**: https://github.com/warehouse-network/claude-db-integrity/issues
- **Discussions**: https://github.com/warehouse-network/claude-db-integrity/discussions  
- **Discord**: https://discord.gg/claude-db-integrity
- **Email**: support@claude-db-integrity.com

## 📋 Release Template

Use this template for release notes:

```markdown
## [v1.0.0] - 2024-12-25

### 🎉 New Features
- Feature 1 description
- Feature 2 description

### 🐛 Bug Fixes
- Bug fix 1 description
- Bug fix 2 description

### 🔧 Improvements
- Improvement 1 description
- Improvement 2 description

### ⚠️ Breaking Changes
- Breaking change 1 description
- Migration instructions

### 📚 Documentation
- Documentation updates

### 🙏 Contributors
- @contributor1
- @contributor2
```

## 🎯 Next Steps

After successful publishing:

1. Monitor npm download stats
2. Respond to community feedback
3. Plan next release features
4. Update examples and tutorials
5. Improve documentation based on user questions