#!/bin/bash

# Claude DB Integrity - Quick Setup Script
# One-command setup for new projects

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(pwd)"
PACKAGE_NAME="claude-db-integrity"

# Function to print colored output
print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to detect project type
detect_project_type() {
    if [ -f "next.config.js" ] || [ -f "next.config.ts" ] || [ -f "next.config.mjs" ]; then
        echo "nextjs"
    elif [ -f "nest-cli.json" ] || grep -q "@nestjs/core" package.json 2>/dev/null; then
        echo "nestjs"
    elif grep -q "express" package.json 2>/dev/null; then
        echo "express"
    elif [ -f "package.json" ]; then
        echo "node"
    else
        echo "generic"
    fi
}

# Function to detect database type
detect_database_type() {
    if [ -f "prisma/schema.prisma" ] || grep -q "prisma" package.json 2>/dev/null; then
        echo "prisma"
    elif grep -q "typeorm" package.json 2>/dev/null; then
        echo "typeorm"
    elif grep -q "sequelize" package.json 2>/dev/null; then
        echo "sequelize"
    elif grep -q "mongoose" package.json 2>/dev/null; then
        echo "mongoose"
    else
        echo "generic"
    fi
}

# Function to check prerequisites
check_prerequisites() {
    print_step "Checking prerequisites..."
    
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js 18+ and try again."
        exit 1
    fi
    
    if ! command_exists npm; then
        print_error "npm is not installed. Please install npm and try again."
        exit 1
    fi
    
    # Check Node.js version
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version 18 or higher is required. Current version: $(node -v)"
        exit 1
    fi
    
    # Check if we're in a Node.js project
    if [ ! -f "package.json" ]; then
        print_warning "No package.json found. Initializing new Node.js project..."
        npm init -y
    fi
    
    print_success "Prerequisites check passed"
}

# Function to install package
install_package() {
    print_step "Installing $PACKAGE_NAME..."
    
    # Try to install the package
    if npm list $PACKAGE_NAME >/dev/null 2>&1; then
        print_warning "$PACKAGE_NAME is already installed"
        
        # Ask if user wants to update
        read -p "Do you want to update to the latest version? [y/N]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            npm update $PACKAGE_NAME
            print_success "Package updated successfully"
        fi
    else
        # Install the package
        npm install $PACKAGE_NAME
        print_success "Package installed successfully"
    fi
}

# Function to initialize configuration
initialize_config() {
    local project_type=$1
    local database_type=$2
    
    print_step "Initializing configuration for $project_type project with $database_type..."
    
    # Run the package's initialization command
    npx claude-db-integrity init \
        --template="$project_type" \
        --database="$database_type" \
        --skip-install \
        --interactive=false
    
    print_success "Configuration initialized"
}

# Function to setup environment variables
setup_environment() {
    print_step "Setting up environment variables..."
    
    # Check if .env file exists
    if [ ! -f ".env" ]; then
        print_warning "No .env file found. Creating one..."
        
        # Create basic .env file
        cat > .env << EOF
# Claude DB Integrity Configuration
CLAUDE_INTEGRITY_ENABLED=true
CLAUDE_INTEGRITY_LOG_LEVEL=info

# Database Configuration (update these values)
DATABASE_URL=postgresql://username:password@localhost:5432/database
# DATABASE_URL=mysql://username:password@localhost:3306/database
# DATABASE_URL=sqlite:./database.sqlite

# Claude Flow Integration (optional)
CLAUDE_FLOW_ENABLED=true
CLAUDE_FLOW_NAMESPACE=my-project-integrity

# Monitoring (optional)
CLAUDE_INTEGRITY_MONITORING_PORT=3001
CLAUDE_INTEGRITY_ALERTS_EMAIL=admin@example.com

# Development vs Production
NODE_ENV=development
EOF
        
        print_success ".env file created"
        print_warning "Please update the DATABASE_URL and other configuration values in .env"
    else
        # Check if Claude Integrity variables exist
        if ! grep -q "CLAUDE_INTEGRITY_ENABLED" .env; then
            print_step "Adding Claude Integrity variables to existing .env..."
            
            cat >> .env << EOF

# Claude DB Integrity Configuration
CLAUDE_INTEGRITY_ENABLED=true
CLAUDE_INTEGRITY_LOG_LEVEL=info
CLAUDE_FLOW_ENABLED=true
CLAUDE_FLOW_NAMESPACE=my-project-integrity
EOF
            
            print_success "Environment variables added to existing .env"
        else
            print_success "Environment variables already exist in .env"
        fi
    fi
}

# Function to setup scripts in package.json
setup_scripts() {
    print_step "Adding scripts to package.json..."
    
    # Use Node.js to add scripts to package.json
    node << 'EOF'
const fs = require('fs');
const path = require('path');

try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // Ensure scripts section exists
    if (!packageJson.scripts) {
        packageJson.scripts = {};
    }
    
    // Add Claude DB Integrity scripts
    const scriptsToAdd = {
        'integrity:check': 'claude-db-integrity check',
        'integrity:drift': 'claude-db-integrity drift',
        'integrity:validate': 'claude-db-integrity validate',
        'integrity:monitor': 'claude-db-integrity monitor --dashboard',
        'integrity:test': 'claude-db-integrity test --personas',
        'integrity:health': 'claude-db-integrity health'
    };
    
    let added = 0;
    for (const [script, command] of Object.entries(scriptsToAdd)) {
        if (!packageJson.scripts[script]) {
            packageJson.scripts[script] = command;
            added++;
        }
    }
    
    if (added > 0) {
        fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
        console.log(`Added ${added} scripts to package.json`);
    } else {
        console.log('Scripts already exist in package.json');
    }
} catch (error) {
    console.error('Error updating package.json:', error.message);
    process.exit(1);
}
EOF
    
    print_success "Scripts added to package.json"
}

# Function to setup Git hooks
setup_git_hooks() {
    if [ -d ".git" ]; then
        print_step "Setting up Git hooks..."
        
        # Create pre-commit hook
        HOOK_FILE=".git/hooks/pre-commit"
        
        if [ ! -f "$HOOK_FILE" ]; then
            cat > "$HOOK_FILE" << 'EOF'
#!/bin/sh
# Claude DB Integrity pre-commit hook

echo "Running database integrity checks..."

# Check for schema drift
npx claude-db-integrity drift --check-only --quiet

# Validate any database-related files
if git diff --cached --name-only | grep -E '\.(sql|prisma|js|ts)$' > /dev/null; then
    echo "Database-related files changed, running validation..."
    npx claude-db-integrity validate --staged-files --fail-fast
fi

# Quick integrity check
npx claude-db-integrity check --quick --quiet

if [ $? -ne 0 ]; then
    echo "❌ Integrity checks failed. Commit aborted."
    echo "Run 'npm run integrity:check' for detailed information."
    exit 1
fi

echo "✅ Integrity checks passed"
EOF
            
            chmod +x "$HOOK_FILE"
            print_success "Git pre-commit hook installed"
        else
            print_warning "Git pre-commit hook already exists"
        fi
    else
        print_warning "Not a Git repository. Skipping Git hooks setup."
    fi
}

# Function to create initial test
create_initial_test() {
    print_step "Creating initial test..."
    
    # Create tests directory if it doesn't exist
    mkdir -p tests
    
    # Create basic integrity test
    cat > tests/integrity.test.js << 'EOF'
const { healthCheck, createIntegrityEngine } = require('claude-db-integrity');

describe('Database Integrity', () => {
  test('health check passes', async () => {
    const result = await healthCheck();
    expect(result.status).toBe('healthy');
  }, 30000);
  
  test('integrity engine initializes', async () => {
    const engine = createIntegrityEngine();
    await expect(engine.initialize()).resolves.not.toThrow();
    await engine.shutdown();
  }, 10000);
});
EOF
    
    print_success "Initial test created"
}

# Function to run initial validation
run_initial_validation() {
    print_step "Running initial validation..."
    
    # Try to run a basic health check
    if npx claude-db-integrity health --timeout=10; then
        print_success "Initial validation passed"
    else
        print_warning "Initial validation failed. This is normal for new setups."
        print_warning "Please configure your database connection and run 'npm run integrity:check'"
    fi
}

# Function to display next steps
show_next_steps() {
    local project_type=$1
    local database_type=$2
    
    echo
    print_success "🎉 Claude DB Integrity setup completed!"
    echo
    echo -e "${BLUE}Project Type:${NC} $project_type"
    echo -e "${BLUE}Database Type:${NC} $database_type"
    echo
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Update your DATABASE_URL in .env file"
    echo "2. Configure claude-db-integrity.config.js for your specific needs"
    echo "3. Run 'npm run integrity:check' to validate your database"
    echo "4. Set up monitoring with 'npm run integrity:monitor'"
    echo "5. Create personas for testing with 'npx claude-db-integrity personas create'"
    echo
    echo -e "${YELLOW}Available Commands:${NC}"
    echo "  npm run integrity:check     - Run integrity checks"
    echo "  npm run integrity:drift     - Check for schema drift" 
    echo "  npm run integrity:validate  - Validate data"
    echo "  npm run integrity:monitor   - Start monitoring dashboard"
    echo "  npm run integrity:test      - Run persona-based tests"
    echo "  npm run integrity:health    - Quick health check"
    echo
    echo -e "${YELLOW}Documentation:${NC}"
    echo "  README.md                   - Basic usage"
    echo "  docs/INTEGRATION_GUIDE.md   - Framework integration"
    echo "  docs/MIGRATION_GUIDE.md     - Migration from existing solutions"
    echo
    echo -e "${GREEN}Happy coding! 🚀${NC}"
}

# Function to handle errors
handle_error() {
    print_error "Setup failed at step: $1"
    echo "Please check the error messages above and try again."
    echo "If you need help, please visit: https://github.com/warehouse-network/claude-db-integrity/issues"
    exit 1
}

# Main function
main() {
    echo -e "${GREEN}🚀 Claude DB Integrity Quick Setup${NC}"
    echo "This script will set up Claude DB Integrity for your project."
    echo
    
    # Parse command line arguments
    INTERACTIVE=true
    FORCE=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --non-interactive)
                INTERACTIVE=false
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  --non-interactive  Run without prompts"
                echo "  --force           Overwrite existing files"
                echo "  --help            Show this help"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Check prerequisites
    check_prerequisites || handle_error "Prerequisites check"
    
    # Detect project configuration
    PROJECT_TYPE=$(detect_project_type)
    DATABASE_TYPE=$(detect_database_type)
    
    if [ "$INTERACTIVE" = true ]; then
        echo "Detected project type: $PROJECT_TYPE"
        echo "Detected database type: $DATABASE_TYPE"
        echo
        
        read -p "Continue with setup? [Y/n]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "Setup cancelled by user."
            exit 0
        fi
    fi
    
    # Run setup steps
    install_package || handle_error "Package installation"
    initialize_config "$PROJECT_TYPE" "$DATABASE_TYPE" || handle_error "Configuration initialization"
    setup_environment || handle_error "Environment setup"
    setup_scripts || handle_error "Scripts setup"
    setup_git_hooks || handle_error "Git hooks setup"
    create_initial_test || handle_error "Test creation"
    run_initial_validation || handle_error "Initial validation"
    
    # Show completion message
    show_next_steps "$PROJECT_TYPE" "$DATABASE_TYPE"
}

# Trap errors and cleanup
trap 'handle_error "Unknown error occurred"' ERR

# Run main function
main "$@"