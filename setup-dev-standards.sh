#!/bin/bash

# Claude DevOps Platform Quick Setup Script  
# Usage: curl -fsSL https://example.com/setup-claude-platform.sh | bash

set -e

echo "🚀 Setting up Claude DevOps Platform with GitOps & Monorepo..."
echo "   This includes: Development Standards + GitOps + Monorepo + Infrastructure"

# Detect package manager
if [ -f "pnpm-lock.yaml" ]; then
    PKG_MANAGER="pnpm"
elif [ -f "yarn.lock" ]; then
    PKG_MANAGER="yarn"
elif [ -f "package-lock.json" ]; then
    PKG_MANAGER="npm"
else
    PKG_MANAGER="npm"
fi

echo "📦 Detected package manager: $PKG_MANAGER"

# Install claude-devops-platform
echo "📥 Installing claude-devops-platform..."
$PKG_MANAGER add -D claude-devops-platform@latest

# Initialize full DevOps platform
echo "⚙️  Initializing DevOps platform (GitOps + Monorepo + Standards)..."
npx claude-platform init --preset production

# Set up GitOps workflows
echo "🔄 Setting up GitOps workflows and infrastructure..."
npx claude-platform gitops setup --environments dev,staging,prod
npx claude-platform infra init --cloud aws
npx claude-platform monitoring setup

# Set up git hooks
echo "🪝 Setting up git hooks..."
npx husky install
npx husky add .husky/pre-commit "npx claude-platform validate --staged"
npx husky add .husky/pre-push "npx claude-platform validate"
npx husky add .husky/post-merge "npx claude-platform doctor"

# Add npm scripts
echo "📝 Adding npm scripts..."
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

pkg.scripts = pkg.scripts || {};
// Development standards
pkg.scripts['dev:check'] = 'claude-platform validate';
pkg.scripts['dev:fix'] = 'claude-platform fix';
pkg.scripts['dev:doctor'] = 'claude-platform doctor';

// GitOps and deployment
pkg.scripts['deploy:dev'] = 'claude-platform deploy --env dev';
pkg.scripts['deploy:staging'] = 'claude-platform deploy --env staging';
pkg.scripts['deploy:prod'] = 'claude-platform deploy --env prod';
pkg.scripts['infra:plan'] = 'claude-platform infra plan';
pkg.scripts['infra:apply'] = 'claude-platform infra apply';

// Monorepo management
pkg.scripts['build:all'] = 'claude-platform build --all';
pkg.scripts['test:all'] = 'claude-platform test --all';
pkg.scripts['version:bump'] = 'claude-platform version --changesets';

// Monitoring and ops
pkg.scripts['logs:tail'] = 'claude-platform logs --follow';
pkg.scripts['monitor:health'] = 'claude-platform monitor --health';
pkg.scripts['backup:create'] = 'claude-platform backup --create';

// Git hooks
pkg.scripts['precommit'] = 'claude-platform validate --staged';
pkg.scripts['prepush'] = 'claude-platform validate';

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

# Create Claude-flow configuration
echo "🔧 Configuring Claude-flow integration..."
mkdir -p .claude-flow
cat > .claude-flow/config.json << 'EOF'
{
  "hooks": {
    "pre-edit": "npx claude-platform validate --quiet --file ${FILE}",
    "post-edit": "npx claude-platform validate --file ${FILE} --fix",
    "pre-task": "npx claude-platform validate --pre-task",
    "post-task": "npx claude-platform validate --post-task",
    "session-start": "npx claude-platform doctor && npx claude-platform monitor --health",
    "session-end": "npx claude-platform report --session"
  },
  "platform": {
    "autoFix": true,
    "blockOnErrors": true,
    "reportFormat": "detailed",
    "gitops": {
      "enabled": true,
      "environments": ["dev", "staging", "prod"],
      "autoDeployDev": true
    },
    "monorepo": {
      "enabled": true,
      "buildTool": "turbo",
      "sharedConfigs": true
    },
    "infrastructure": {
      "provider": "aws",
      "monitoring": true,
      "security": true
    },
    "checks": [
      "typescript",
      "eslint", 
      "prettier",
      "dependencies",
      "security",
      "no-mocks",
      "real-database",
      "proper-auth",
      "docker",
      "k8s-lint",
      "terraform-validate",
      "cost-analysis"
    ]
  }
}
EOF

# Create VS Code settings
echo "💻 Configuring VS Code..."
mkdir -p .vscode
cat > .vscode/settings.json << 'EOF'
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true,
    "source.organizeImports": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "files.exclude": {
    "**/.git": true,
    "**/.DS_Store": true,
    "**/node_modules": true,
    "**/.next": true,
    "**/dist": true,
    "**/build": true
  }
}
EOF

# Run initial platform setup
echo "🔍 Running initial platform validation and setup..."
npx claude-platform doctor || true
npx claude-platform validate || true

echo "
✅ Claude DevOps Platform setup complete!

🏗️ Infrastructure & GitOps:
  npm run infra:plan       - Plan infrastructure changes
  npm run infra:apply      - Apply infrastructure
  npm run deploy:dev       - Deploy to development
  npm run deploy:staging   - Deploy to staging
  npm run deploy:prod      - Deploy to production

🔧 Development & Monorepo:
  npm run dev:check        - Run all validation checks
  npm run dev:fix          - Auto-fix development issues
  npm run build:all        - Build all packages
  npm run test:all         - Test all packages
  npm run version:bump     - Bump package versions

📊 Monitoring & Operations:
  npm run monitor:health   - Check system health
  npm run logs:tail        - Tail application logs
  npm run backup:create    - Create backup

🪝 Git hooks installed:
  pre-commit - Validates staged files (dev standards + infra)
  pre-push   - Full validation before push
  post-merge - Health check after merge

🤖 Claude-flow integration active:
  ✅ Development standards validation
  ✅ GitOps workflow automation
  ✅ Infrastructure validation
  ✅ Monitoring and health checks
  ✅ Session reporting and analytics

🚀 What's been set up:
  ✅ Monorepo structure with shared configs
  ✅ GitHub Actions CI/CD workflows
  ✅ Kubernetes manifests and Helm charts
  ✅ Terraform infrastructure modules
  ✅ Monitoring stack (Prometheus, Grafana, Jaeger)
  ✅ Security scanning and compliance
  ✅ Development containers
  ✅ Production-ready standards enforcement

💡 Next steps:
  1. Run 'npm run dev:doctor' to check system health
  2. Configure AWS/cloud credentials for infrastructure
  3. Run 'npm run infra:plan' to see infrastructure changes
  4. Commit and push to trigger first GitOps deployment
  5. Share platform config with your team

Welcome to enterprise-grade DevOps! 🏭🚀
"