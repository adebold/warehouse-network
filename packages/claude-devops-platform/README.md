# Claude DevOps Platform

A comprehensive, production-ready DevOps platform with integrated project management features. Built with Claude Flow integration for AI-enhanced development workflows.

## Features

### 🚀 Core Platform Features
- **Code Quality Analysis**: TypeScript/JavaScript linting, complexity analysis, dead code detection
- **Performance Monitoring**: Real-time metrics, bottleneck detection, optimization suggestions
- **Security Scanning**: Vulnerability detection, dependency auditing, security best practices
- **CI/CD Automation**: Pipeline generation, deployment strategies, rollback capabilities

### 📋 Project Management Features
- **User Story Management**: Epic/Story/Task hierarchy with full lifecycle management
- **Acceptance Criteria**: Testable criteria with automated test generation
- **Prisma Schema Validation**: Comprehensive schema analysis and optimization
- **Quality Gates**: Automated quality checks at each development stage
- **Story-Driven Development**: Generate code, tests, and documentation from user stories
- **Requirements Traceability**: Track requirements through implementation
- **GitHub/Jira/Linear Integration**: Seamless synchronization with external tools

## Installation

```bash
# Install globally
npm install -g @claude/devops-platform

# Or use with npx
npx @claude/devops-platform
```

## Quick Start

### Initialize Platform
```bash
# Initialize with all features
claude-platform init --with-pm --with-claude-flow

# Basic initialization
claude-platform init
```

### Project Management Commands

#### Story Management
```bash
# Create a new story interactively
claude-platform story create -i

# Create with AI assistance
claude-platform story create --ai-assist

# Create from template
claude-platform story create -t api-feature

# List all stories
claude-platform story list

# Update story status
claude-platform story update STORY-123 -s in_progress

# Generate code from story
claude-platform story generate STORY-123 -l typescript
```

#### Epic Planning
```bash
# Plan an epic with AI
claude-platform epic plan --auto-stories

# Break down epic into stories
claude-platform epic breakdown EPIC-001 --ai-assist
```

#### Schema Management
```bash
# Validate Prisma schema
claude-platform schema validate

# Optimize schema with suggestions
claude-platform schema optimize --apply

# Analyze schema change impact
claude-platform schema impact --previous prisma/schema.old.prisma
```

#### Quality Management
```bash
# Run quality gates for a story
claude-platform quality check STORY-123

# Generate quality report
claude-platform quality report --format html

# Check requirements coverage
claude-platform requirements coverage --report
```

#### Integrations
```bash
# Sync with GitHub
claude-platform integrate github --sync-stories --setup-workflows

# Future: Jira integration
claude-platform integrate jira --sync

# Future: Linear integration
claude-platform integrate linear --sync
```

## User Story Templates

The platform includes pre-built templates for common story types:

- `api-feature`: REST API endpoint implementation
- `ui-component`: Frontend component development
- `database-migration`: Database schema changes
- `performance-optimization`: Performance improvements
- `security-enhancement`: Security features
- `bug-fix`: Bug resolution
- `feature-flag`: Feature flag implementation
- `integration`: External service integration
- `data-migration`: Data migration tasks
- `monitoring`: Observability setup

## Quality Gates

Automated quality checks ensure code meets standards:

1. **Acceptance Criteria Validation**: All criteria properly defined
2. **Test Coverage**: Minimum 80% coverage requirement
3. **Performance Standards**: Load time and response metrics
4. **Security Validation**: Vulnerability scanning
5. **Documentation Requirements**: Code and API documentation

## Story-Driven Development

Generate complete implementations from user stories:

```bash
# Generate full implementation
claude-platform story generate STORY-123 \
  --language typescript \
  --framework express \
  --dry-run

# Files generated:
# - Implementation code
# - Unit tests
# - Integration tests
# - API documentation
# - Database migrations
# - Docker configuration
```

## Prisma Schema Validation

Comprehensive schema analysis with:

- Naming convention checks
- Relationship validation
- Index optimization suggestions
- Security best practices
- Performance recommendations
- Migration impact analysis

## Claude Flow Integration

The platform leverages Claude Flow for enhanced AI capabilities:

```bash
# Initialize Claude Flow agents
npx claude-flow@alpha swarm init --topology hierarchical

# Available agents:
# - planner: Story planning and breakdown
# - architect: System design
# - coder: Implementation
# - tester: Test generation
# - reviewer: Code review
# - documenter: Documentation
```

## API Usage

```typescript
import { 
  StoryManager, 
  PrismaValidator, 
  QualityGateManager,
  StoryDrivenDevelopment 
} from '@claude/devops-platform';

// Create a story programmatically
const storyManager = new StoryManager();
const story = await storyManager.createStory({
  title: 'Implement user authentication',
  asA: 'developer',
  iWant: 'secure user authentication',
  soThat: 'users can safely access the system',
  type: 'story',
  priority: 'high'
});

// Validate Prisma schema
const validator = new PrismaValidator('prisma/schema.prisma');
const result = await validator.validate();

// Run quality gates
const qualityGates = new QualityGateManager();
const gateResults = await qualityGates.runGates(story, {
  codebasePath: process.cwd()
});

// Generate code from story
const codegen = new StoryDrivenDevelopment();
const generated = await codegen.generateFromStory(story, {
  language: 'typescript',
  framework: 'express'
});
```

## Configuration

Create `.claude-devops.json` in your project root:

```json
{
  "projectManagement": {
    "defaultPriority": "medium",
    "requireAcceptanceCriteria": true,
    "minTestCoverage": 80,
    "autoAssignStories": true
  },
  "quality": {
    "enabledGates": ["acceptance-criteria", "test-coverage", "security"],
    "strictMode": false
  },
  "integrations": {
    "github": {
      "owner": "your-org",
      "repo": "your-repo",
      "autoSync": true
    }
  },
  "schema": {
    "strictValidation": true,
    "autoOptimize": false
  }
}
```

## Best Practices

1. **Always define acceptance criteria** for user stories
2. **Use templates** for consistent story creation
3. **Run quality gates** before marking stories as done
4. **Validate schema changes** before applying migrations
5. **Enable GitHub integration** for automated workflows
6. **Use AI assistance** for story planning and breakdown
7. **Maintain requirements traceability** for compliance

## License

MIT

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.