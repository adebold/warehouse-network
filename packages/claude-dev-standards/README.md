# Claude Dev Standards

Production-ready development standards for Claude Code projects with automated validation and setup.

## Features

- 🚀 **Auto-detect project type** - Automatically detects Node.js, Python, Go, Java, and more
- ✅ **Production validation** - Ensures no mocks, proper auth, real databases
- 🔧 **Automated setup** - Sets up linting, testing, CI/CD, Docker, and more
- 🎯 **Claude-flow integration** - Seamless integration with Claude-flow hooks
- 📋 **Custom configurations** - Extend and customize standards per project
- 🔍 **Comprehensive checks** - Security, performance, code quality, and more

## Installation

```bash
npm install -D claude-dev-standards
# or
yarn add -D claude-dev-standards
# or
pnpm add -D claude-dev-standards
```

## Quick Start

### Initialize standards in your project

```bash
npx claude-dev-standards init
# or use the shorthand
npx cds init
```

This will:
1. Detect your project type
2. Create appropriate configuration files
3. Set up git hooks
4. Configure CI/CD workflows
5. Add production-ready boilerplate

### Validate your project

```bash
npx claude-dev-standards validate
# or
npx cds validate
```

### Run specific checks

```bash
# Check for mocks
npx cds check mocks

# Check authentication implementation
npx cds check auth

# Check database setup
npx cds check database

# Check all production standards
npx cds check all
```

## Configuration

Create a `.claude-standards.json` file in your project root:

```json
{
  "extends": "claude-dev-standards/recommended",
  "projectType": "auto",
  "checks": {
    "noMocks": true,
    "realDatabase": true,
    "authentication": true,
    "errorHandling": true,
    "logging": true,
    "testing": true,
    "docker": true,
    "ci": true
  },
  "custom": {
    "minTestCoverage": 80,
    "requiredEnvVars": ["DATABASE_URL", "JWT_SECRET"],
    "forbiddenPatterns": ["console.log", "any as any"]
  }
}
```

## CLI Commands

### `init [options]`
Initialize Claude standards in your project

Options:
- `-t, --type <type>` - Specify project type (node, python, go, etc.)
- `-f, --force` - Overwrite existing configuration
- `--no-git-hooks` - Skip git hooks setup

### `validate [options]`
Validate project against Claude standards

Options:
- `-f, --fix` - Attempt to fix issues automatically
- `--json` - Output results as JSON
- `--strict` - Fail on warnings

### `check <type>`
Run specific validation checks

Types:
- `mocks` - Check for mock usage
- `auth` - Validate authentication implementation
- `database` - Check database setup
- `logging` - Validate logging configuration
- `testing` - Check test coverage and setup
- `security` - Run security checks
- `all` - Run all checks

### `setup <component>`
Set up specific components

Components:
- `docker` - Add Docker configuration
- `ci` - Set up CI/CD workflows
- `testing` - Configure testing framework
- `database` - Set up database migrations
- `monitoring` - Add monitoring configuration

### `fix [options]`
Auto-fix common issues

Options:
- `--dry-run` - Show what would be fixed
- `--interactive` - Prompt before each fix

## Integration with Claude-flow

This package integrates seamlessly with Claude-flow hooks:

```bash
# In your Claude-flow hooks
npx claude-flow hooks pre-task --validate-standards
npx claude-flow hooks post-edit --check-standards
```

## Project Type Detection

The package automatically detects:
- **Node.js** - package.json presence
- **Python** - requirements.txt, setup.py, pyproject.toml
- **Go** - go.mod
- **Java** - pom.xml, build.gradle
- **Ruby** - Gemfile
- **PHP** - composer.json
- **Rust** - Cargo.toml

## Validation Rules

### No Mocks Policy
- ❌ Mock databases (mockDB, in-memory stores)
- ❌ Fake authentication (hardcoded users)
- ❌ Stub API responses
- ✅ Real PostgreSQL/MySQL/MongoDB
- ✅ Proper JWT/OAuth implementation
- ✅ Actual external service integration

### Production Requirements
- Real database with migrations
- JWT authentication with refresh tokens
- Comprehensive error handling
- Structured logging (not console.log)
- Environment-based configuration
- Docker containerization
- CI/CD pipeline
- Automated testing (>80% coverage)
- Security headers
- Rate limiting
- Health checks
- Graceful shutdown

## Extending Standards

Create custom validators:

```javascript
// .claude-standards.js
module.exports = {
  extends: 'claude-dev-standards/recommended',
  validators: {
    customCheck: async (project) => {
      // Your validation logic
      return {
        passed: true,
        errors: [],
        warnings: []
      };
    }
  }
};
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT © Claude Dev Standards Team