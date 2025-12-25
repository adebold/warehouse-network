# Contributing to Claude Dev Standards

We welcome contributions to the Claude Dev Standards package! This guide will help you get started.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/claude-dev-standards.git`
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature-name`

## Development

### Project Structure

```
claude-dev-standards/
├── bin/              # CLI executable
├── lib/              # Core library code
│   ├── commands/     # CLI command handlers
│   ├── validators/   # Validation modules
│   ├── standards/    # Standard configurations
│   └── utils/        # Utility functions
├── templates/        # File templates
└── tests/           # Test files
```

### Running Tests

```bash
npm test                 # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage
```

### Linting

```bash
npm run lint            # Check code style
npm run lint:fix        # Fix code style issues
```

## Adding a New Validator

1. Create a new file in `lib/validators/`:

```javascript
// lib/validators/myvalidator.js
async function check(projectPath, config) {
  const errors = [];
  const warnings = [];
  const info = [];
  
  // Your validation logic here
  
  return {
    passed: errors.length === 0,
    errors,
    warnings,
    info
  };
}

module.exports = { check };
```

2. Add to `lib/validators/index.js`:

```javascript
module.exports = {
  // ... existing validators
  myvalidator: require('./myvalidator')
};
```

3. Update configuration schemas and documentation

## Adding a New Command

1. Create a new file in `lib/commands/`:

```javascript
// lib/commands/mycommand.js
async function mycommand(options) {
  // Command implementation
}

module.exports = mycommand;
```

2. Add to `bin/claude-dev-standards`:

```javascript
program
  .command('mycommand')
  .description('Description of your command')
  .action(require('../lib/commands/mycommand'));
```

## Submitting Changes

1. Write clear commit messages
2. Include tests for new features
3. Update documentation
4. Ensure all tests pass: `npm test`
5. Submit a pull request

### Commit Message Format

```
type: brief description

Longer description if needed.

Closes #123
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Testing Your Changes

Before submitting:

1. Run the full test suite: `npm test`
2. Test the CLI locally: `npm link` then `cds --help`
3. Validate against a real project
4. Check documentation is updated

## Release Process

Releases are managed by maintainers following semantic versioning:

- MAJOR: Breaking changes
- MINOR: New features (backward compatible)
- PATCH: Bug fixes

## Questions?

Feel free to open an issue for questions or discussions!