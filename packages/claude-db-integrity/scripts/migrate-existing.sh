#!/bin/bash

# Claude DB Integrity - Migration Script
# Migrate from custom DB logging and integrity solutions

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(pwd)"
BACKUP_DIR="./migration-backup-$(date +%Y%m%d-%H%M%S)"
PACKAGE_NAME="claude-db-integrity"

# Function to print colored output
print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_substep() {
    echo -e "  ${PURPLE}→${NC} $1"
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

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to create backup
create_backup() {
    print_step "Creating backup of existing setup..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup validation files
    print_substep "Backing up validation files..."
    find . -name "*.js" -o -name "*.ts" | xargs grep -l "validate\|schema\|integrity" 2>/dev/null | while read file; do
        if [[ "$file" != *"node_modules"* ]] && [[ "$file" != *"migration-backup"* ]]; then
            echo "  Backing up: $file"
            mkdir -p "$BACKUP_DIR/$(dirname "$file")"
            cp "$file" "$BACKUP_DIR/$file"
        fi
    done
    
    # Backup database schema files
    print_substep "Backing up database schema files..."
    find . -name "*.sql" -o -name "schema.prisma" -o -name "*migration*" 2>/dev/null | while read file; do
        if [[ "$file" != *"node_modules"* ]] && [[ "$file" != *"migration-backup"* ]]; then
            echo "  Backing up: $file"
            mkdir -p "$BACKUP_DIR/$(dirname "$file")"
            cp "$file" "$BACKUP_DIR/$file"
        fi
    done
    
    # Backup configuration files
    print_substep "Backing up configuration files..."
    for file in package.json .env tsconfig.json jest.config.js; do
        if [ -f "$file" ]; then
            cp "$file" "$BACKUP_DIR/"
        fi
    done
    
    # Create backup manifest
    cat > "$BACKUP_DIR/manifest.json" << EOF
{
  "backupDate": "$(date -Iseconds)",
  "projectRoot": "$PROJECT_ROOT",
  "migrationVersion": "1.0.0",
  "preExistingPackages": $(npm list --depth=0 --json 2>/dev/null | jq .dependencies || echo "{}")
}
EOF
    
    print_success "Backup created at: $BACKUP_DIR"
}

# Function to analyze existing validation patterns
analyze_existing_patterns() {
    print_step "Analyzing existing validation patterns..."
    
    # Create analysis directory
    mkdir -p migration-analysis
    
    # Find validation functions
    print_substep "Finding validation functions..."
    grep -r "function.*validate\|const.*validate\|validate.*=" . --include="*.js" --include="*.ts" \
        --exclude-dir=node_modules --exclude-dir=migration-backup* 2>/dev/null > migration-analysis/validation-functions.txt || true
    
    # Find schema definitions
    print_substep "Finding schema definitions..."
    grep -r "schema\|Schema\|SCHEMA" . --include="*.js" --include="*.ts" \
        --exclude-dir=node_modules --exclude-dir=migration-backup* 2>/dev/null > migration-analysis/schemas.txt || true
    
    # Find database operations
    print_substep "Finding database operations..."
    grep -r "INSERT\|UPDATE\|DELETE\|CREATE TABLE\|ALTER TABLE" . --include="*.js" --include="*.ts" --include="*.sql" \
        --exclude-dir=node_modules --exclude-dir=migration-backup* 2>/dev/null > migration-analysis/db-operations.txt || true
    
    # Find logging patterns
    print_substep "Finding logging patterns..."
    grep -r "console\.log\|logger\|log\|audit" . --include="*.js" --include="*.ts" \
        --exclude-dir=node_modules --exclude-dir=migration-backup* 2>/dev/null > migration-analysis/logging-patterns.txt || true
    
    # Generate analysis summary
    cat > migration-analysis/summary.md << 'EOF'
# Migration Analysis Summary

## Validation Functions Found
```bash
$(wc -l < migration-analysis/validation-functions.txt) validation functions detected
```

## Schema Definitions Found
```bash
$(wc -l < migration-analysis/schemas.txt) schema references detected
```

## Database Operations Found
```bash
$(wc -l < migration-analysis/db-operations.txt) database operations detected
```

## Logging Patterns Found
```bash
$(wc -l < migration-analysis/logging-patterns.txt) logging patterns detected
```

## Recommended Migration Strategy

Based on the analysis, we recommend:

1. **Validation Migration**: Convert existing validation functions to JSON Schema
2. **Database Integration**: Set up Claude DB Integrity with your current database
3. **Logging Enhancement**: Replace basic logging with structured integrity logging
4. **Monitoring Setup**: Implement automated integrity monitoring

## Files to Review

Please review these files for manual migration:

EOF
    
    # Add files that need manual review
    if [ -s migration-analysis/validation-functions.txt ]; then
        echo "### Validation Functions" >> migration-analysis/summary.md
        awk '{print "- " $0}' migration-analysis/validation-functions.txt | head -10 >> migration-analysis/summary.md
    fi
    
    if [ -s migration-analysis/schemas.txt ]; then
        echo "### Schema Definitions" >> migration-analysis/summary.md
        awk '{print "- " $0}' migration-analysis/schemas.txt | head -10 >> migration-analysis/summary.md
    fi
    
    print_success "Analysis completed. Review migration-analysis/summary.md"
}

# Function to detect current setup type
detect_current_setup() {
    print_step "Detecting current setup..."
    
    SETUP_TYPE="unknown"
    DATABASE_TYPE="unknown"
    
    # Check for Prisma
    if [ -f "prisma/schema.prisma" ] || grep -q "prisma" package.json 2>/dev/null; then
        DATABASE_TYPE="prisma"
        print_info "Detected Prisma setup"
    fi
    
    # Check for TypeORM
    if grep -q "typeorm" package.json 2>/dev/null; then
        DATABASE_TYPE="typeorm"
        print_info "Detected TypeORM setup"
    fi
    
    # Check for Sequelize
    if grep -q "sequelize" package.json 2>/dev/null; then
        DATABASE_TYPE="sequelize"
        print_info "Detected Sequelize setup"
    fi
    
    # Check for custom validation
    if find . -name "*.js" -o -name "*.ts" | xargs grep -l "validate" 2>/dev/null | head -1 >/dev/null; then
        SETUP_TYPE="custom-validation"
        print_info "Detected custom validation setup"
    fi
    
    # Check for framework
    if [ -f "next.config.js" ] || [ -f "next.config.ts" ]; then
        FRAMEWORK="nextjs"
        print_info "Detected Next.js framework"
    elif grep -q "express" package.json 2>/dev/null; then
        FRAMEWORK="express"
        print_info "Detected Express framework"
    elif grep -q "@nestjs/core" package.json 2>/dev/null; then
        FRAMEWORK="nestjs"
        print_info "Detected NestJS framework"
    else
        FRAMEWORK="generic"
    fi
    
    echo "Setup Type: $SETUP_TYPE"
    echo "Database Type: $DATABASE_TYPE" 
    echo "Framework: $FRAMEWORK"
}

# Function to install Claude DB Integrity
install_claude_integrity() {
    print_step "Installing Claude DB Integrity..."
    
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
        npm install $PACKAGE_NAME
        print_success "Package installed successfully"
    fi
}

# Function to generate migration configuration
generate_migration_config() {
    print_step "Generating migration configuration..."
    
    # Create migration-specific config
    cat > claude-db-integrity.migration.js << EOF
// Claude DB Integrity Migration Configuration
// Generated on $(date)

export default {
  // Migration settings
  migration: {
    enabled: true,
    backupDir: '$BACKUP_DIR',
    originalSetup: {
      type: '$SETUP_TYPE',
      database: '$DATABASE_TYPE',
      framework: '$FRAMEWORK'
    },
    gradualRollout: {
      enabled: true,
      percentage: 10, // Start with 10% of operations
      incrementPerDay: 10
    }
  },
  
  // Database configuration
  database: {
    type: '$DATABASE_TYPE',
    url: process.env.DATABASE_URL,
    // Add your existing database configuration here
  },
  
  // Claude Flow integration
  claude: {
    enabled: true,
    namespace: 'migration-integrity',
    syncInterval: 300,
    memoryTtl: 3600
  },
  
  // Validation settings
  validation: {
    strict: false, // Start with lenient validation during migration
    autoFix: false, // Don't auto-fix during migration
    logViolations: true,
    compareWithLegacy: true // Compare results with legacy validation
  },
  
  // Monitoring during migration
  monitoring: {
    enabled: true,
    dashboardPort: 3001,
    logLevel: 'debug',
    alerts: {
      email: process.env.MIGRATION_ALERT_EMAIL,
      slack: process.env.MIGRATION_SLACK_WEBHOOK
    }
  },
  
  // Legacy comparison
  legacy: {
    enabled: true,
    validateAgainstLegacy: true,
    logDiscrepancies: true,
    failOnDiscrepancies: false
  }
};
EOF
    
    print_success "Migration configuration generated"
}

# Function to create migration tests
create_migration_tests() {
    print_step "Creating migration tests..."
    
    mkdir -p tests/migration
    
    # Create validation comparison test
    cat > tests/migration/validation-comparison.test.js << 'EOF'
const { ValidationManager } = require('claude-db-integrity');
const fs = require('fs');
const path = require('path');

describe('Migration Validation Comparison', () => {
  let validator;
  let legacyTestData;
  
  beforeAll(async () => {
    validator = new ValidationManager();
    
    // Load legacy test data if available
    const testDataPath = path.join(__dirname, '../../migration-analysis/test-data.json');
    if (fs.existsSync(testDataPath)) {
      legacyTestData = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
    }
  });
  
  test('new validation system handles legacy data correctly', async () => {
    if (!legacyTestData) {
      console.warn('No legacy test data found, skipping comparison test');
      return;
    }
    
    for (const [entityType, records] of Object.entries(legacyTestData)) {
      console.log(`Testing ${records.length} ${entityType} records...`);
      
      let successCount = 0;
      let failureCount = 0;
      
      for (const record of records) {
        try {
          const result = await validator.validate(entityType, record);
          
          if (result.isValid) {
            successCount++;
          } else {
            failureCount++;
            console.warn(`Validation failed for ${entityType}:`, {
              record: record.id || 'unknown',
              errors: result.errors
            });
          }
        } catch (error) {
          failureCount++;
          console.error(`Error validating ${entityType}:`, error.message);
        }
      }
      
      console.log(`${entityType}: ${successCount} passed, ${failureCount} failed`);
      
      // Allow some failures during migration, but not more than 10%
      const failureRate = failureCount / (successCount + failureCount);
      expect(failureRate).toBeLessThan(0.1);
    }
  });
  
  test('schema migration is consistent', async () => {
    // Test that migrated schemas are consistent with original data structure
    const schemas = validator.getLoadedSchemas();
    expect(schemas.length).toBeGreaterThan(0);
    
    for (const schema of schemas) {
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    }
  });
});
EOF
    
    # Create performance comparison test
    cat > tests/migration/performance-comparison.test.js << 'EOF'
const { IntegrityEngine } = require('claude-db-integrity');

describe('Migration Performance Comparison', () => {
  let integrityEngine;
  
  beforeAll(async () => {
    integrityEngine = new IntegrityEngine();
    await integrityEngine.initialize();
  });
  
  afterAll(async () => {
    await integrityEngine.shutdown();
  });
  
  test('integrity checks complete within reasonable time', async () => {
    const startTime = Date.now();
    
    const report = await integrityEngine.runIntegrityChecks();
    
    const duration = Date.now() - startTime;
    
    console.log(`Integrity check completed in ${duration}ms`);
    console.log(`Results: ${report.summary.passed} passed, ${report.summary.failed} failed`);
    
    // Should complete within 30 seconds for most setups
    expect(duration).toBeLessThan(30000);
  });
  
  test('validation performance is acceptable', async () => {
    const validator = integrityEngine.getValidator();
    
    // Test validation speed with sample data
    const sampleData = {
      email: 'test@example.com',
      name: 'Test User',
      age: 25
    };
    
    const iterations = 100;
    const startTime = Date.now();
    
    for (let i = 0; i < iterations; i++) {
      await validator.validate('user', sampleData);
    }
    
    const duration = Date.now() - startTime;
    const avgTime = duration / iterations;
    
    console.log(`Average validation time: ${avgTime.toFixed(2)}ms`);
    
    // Should be under 10ms per validation on average
    expect(avgTime).toBeLessThan(10);
  });
});
EOF
    
    print_success "Migration tests created"
}

# Function to create gradual rollout helper
create_rollout_helper() {
    print_step "Creating gradual rollout helper..."
    
    mkdir -p lib/migration
    
    cat > lib/migration/gradual-rollout.js << 'EOF'
const crypto = require('crypto');

class GradualRollout {
  constructor(config = {}) {
    this.percentage = config.percentage || 10;
    this.entity = config.entity || 'default';
    this.enabled = config.enabled !== false;
  }
  
  // Determine if entity should use new validation
  shouldUseNewValidation(entityId) {
    if (!this.enabled) return false;
    
    // Use consistent hashing for deterministic rollout
    const hash = crypto
      .createHash('md5')
      .update(`${this.entity}-${entityId}`)
      .digest('hex');
    
    const hashPercentage = parseInt(hash.slice(0, 2), 16) / 255 * 100;
    return hashPercentage < this.percentage;
  }
  
  // Update rollout percentage
  updatePercentage(newPercentage) {
    this.percentage = Math.min(Math.max(newPercentage, 0), 100);
    console.log(`Rollout percentage updated to ${this.percentage}%`);
  }
  
  // Get current rollout status
  getStatus() {
    return {
      percentage: this.percentage,
      enabled: this.enabled,
      entity: this.entity
    };
  }
}

module.exports = GradualRollout;
EOF
    
    print_success "Gradual rollout helper created"
}

# Function to migrate validation schemas
migrate_validation_schemas() {
    print_step "Migrating validation schemas..."
    
    mkdir -p schemas
    
    # Try to extract schema information from existing validation
    if [ -f "migration-analysis/validation-functions.txt" ]; then
        print_substep "Analyzing existing validation patterns..."
        
        # Look for common validation patterns and create basic schemas
        cat > schemas/user.json << 'EOF'
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "User",
  "type": "object",
  "properties": {
    "id": {
      "type": ["string", "number"],
      "description": "User ID"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "User email address"
    },
    "name": {
      "type": "string",
      "minLength": 1,
      "maxLength": 255,
      "description": "User full name"
    },
    "created_at": {
      "type": "string",
      "format": "date-time",
      "description": "Creation timestamp"
    },
    "updated_at": {
      "type": "string",
      "format": "date-time",
      "description": "Last update timestamp"
    }
  },
  "required": ["email", "name"],
  "additionalProperties": false
}
EOF
        
        # Create a generic entity schema template
        cat > schemas/_template.json << 'EOF'
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Entity Template",
  "type": "object",
  "properties": {
    "id": {
      "type": ["string", "number"],
      "description": "Entity ID"
    },
    "created_at": {
      "type": "string",
      "format": "date-time"
    },
    "updated_at": {
      "type": "string",
      "format": "date-time"
    }
  },
  "additionalProperties": true
}
EOF
        
        print_success "Basic schemas created. Please customize them based on your data model."
    else
        print_warning "No validation patterns found. Please create schemas manually."
    fi
}

# Function to create migration dashboard
create_migration_dashboard() {
    print_step "Creating migration dashboard..."
    
    mkdir -p migration-dashboard
    
    cat > migration-dashboard/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude DB Integrity - Migration Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric { display: inline-block; margin: 10px; padding: 15px; background: #e3f2fd; border-radius: 5px; }
        .status-good { color: #4caf50; }
        .status-warning { color: #ff9800; }
        .status-error { color: #f44336; }
        .progress-bar { width: 100%; height: 20px; background: #eee; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background: #4caf50; transition: width 0.3s ease; }
        pre { background: #f8f8f8; padding: 10px; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Claude DB Integrity Migration Dashboard</h1>
        
        <div class="card">
            <h2>Migration Progress</h2>
            <div class="progress-bar">
                <div class="progress-fill" id="migrationProgress" style="width: 25%"></div>
            </div>
            <p>Phase 1: Initial Setup Complete</p>
        </div>
        
        <div class="card">
            <h2>Current Status</h2>
            <div class="metric">
                <strong>Backup:</strong> <span class="status-good">✓ Created</span>
            </div>
            <div class="metric">
                <strong>Package:</strong> <span class="status-good">✓ Installed</span>
            </div>
            <div class="metric">
                <strong>Configuration:</strong> <span class="status-warning">⚠ Pending</span>
            </div>
            <div class="metric">
                <strong>Schemas:</strong> <span class="status-warning">⚠ Review Required</span>
            </div>
            <div class="metric">
                <strong>Testing:</strong> <span class="status-warning">⚠ Pending</span>
            </div>
        </div>
        
        <div class="card">
            <h2>Next Steps</h2>
            <ol>
                <li>Review and customize schemas in the <code>schemas/</code> directory</li>
                <li>Configure your database connection in <code>claude-db-integrity.migration.js</code></li>
                <li>Run migration tests: <code>npm test -- migration</code></li>
                <li>Start gradual rollout: <code>npm run integrity:check</code></li>
                <li>Monitor results and adjust configuration as needed</li>
            </ol>
        </div>
        
        <div class="card">
            <h2>Migration Commands</h2>
            <pre><code># Run migration tests
npm test -- migration

# Check integrity with new system
npm run integrity:check

# Monitor migration progress
npm run integrity:monitor

# Compare with legacy system
node scripts/compare-legacy.js

# Update rollout percentage
node scripts/update-rollout.js --percentage 50</code></pre>
        </div>
        
        <div class="card">
            <h2>Support</h2>
            <p>If you need help with the migration:</p>
            <ul>
                <li>Check the <a href="../docs/MIGRATION_GUIDE.md">Migration Guide</a></li>
                <li>Review the <a href="../migration-analysis/summary.md">Analysis Summary</a></li>
                <li>Open an issue at: <a href="https://github.com/warehouse-network/claude-db-integrity/issues">GitHub Issues</a></li>
            </ul>
        </div>
    </div>
    
    <script>
        // Simple progress tracking
        const phases = ['backup', 'install', 'config', 'schemas', 'testing'];
        let completedPhases = 2; // backup and install are done
        
        function updateProgress() {
            const percentage = (completedPhases / phases.length) * 100;
            document.getElementById('migrationProgress').style.width = percentage + '%';
        }
        
        updateProgress();
    </script>
</body>
</html>
EOF
    
    print_success "Migration dashboard created at migration-dashboard/index.html"
}

# Function to show migration summary
show_migration_summary() {
    echo
    print_success "🎉 Migration setup completed!"
    echo
    echo -e "${BLUE}Migration Summary:${NC}"
    echo "- Backup created: $BACKUP_DIR"
    echo "- Package installed: $PACKAGE_NAME"
    echo "- Configuration: claude-db-integrity.migration.js"
    echo "- Schemas: schemas/"
    echo "- Tests: tests/migration/"
    echo "- Dashboard: migration-dashboard/index.html"
    echo
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Review migration analysis: migration-analysis/summary.md"
    echo "2. Customize schemas: schemas/*.json"
    echo "3. Configure database: claude-db-integrity.migration.js"
    echo "4. Run migration tests: npm test -- migration"
    echo "5. Start gradual rollout: npm run integrity:check"
    echo "6. Open dashboard: open migration-dashboard/index.html"
    echo
    echo -e "${YELLOW}Migration Commands:${NC}"
    echo "  npm test -- migration        - Run migration tests"
    echo "  npm run integrity:check      - Test new validation system"
    echo "  npm run integrity:monitor    - Monitor migration progress"
    echo
    echo -e "${YELLOW}Rollback if needed:${NC}"
    echo "  ./scripts/rollback-migration.sh"
    echo
    echo -e "${GREEN}Happy migrating! 🚀${NC}"
}

# Function to handle errors
handle_error() {
    print_error "Migration failed at step: $1"
    echo
    echo "A backup of your original setup was created at: $BACKUP_DIR"
    echo "You can restore using: cp -r $BACKUP_DIR/* ."
    echo
    echo "If you need help, please check:"
    echo "- migration-analysis/summary.md for analysis results"
    echo "- docs/MIGRATION_GUIDE.md for detailed guidance"
    echo "- https://github.com/warehouse-network/claude-db-integrity/issues for support"
    exit 1
}

# Main function
main() {
    echo -e "${GREEN}🔄 Claude DB Integrity Migration Script${NC}"
    echo "This script will help you migrate from your existing database integrity solution."
    echo
    
    # Parse command line arguments
    INTERACTIVE=true
    SKIP_BACKUP=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --non-interactive)
                INTERACTIVE=false
                shift
                ;;
            --skip-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --help)
                echo "Usage: $0 [options]"
                echo "Options:"
                echo "  --non-interactive  Run without prompts"
                echo "  --skip-backup     Skip backup creation (not recommended)"
                echo "  --help            Show this help"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    if [ "$INTERACTIVE" = true ]; then
        echo "This will:"
        echo "1. Create a backup of your existing setup"
        echo "2. Analyze your current validation patterns"
        echo "3. Install Claude DB Integrity"
        echo "4. Generate migration configuration"
        echo "5. Create migration tests and gradual rollout helpers"
        echo
        read -p "Continue with migration? [Y/n]: " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "Migration cancelled by user."
            exit 0
        fi
    fi
    
    # Run migration steps
    if [ "$SKIP_BACKUP" = false ]; then
        create_backup || handle_error "Backup creation"
    fi
    
    analyze_existing_patterns || handle_error "Pattern analysis"
    detect_current_setup || handle_error "Setup detection"
    install_claude_integrity || handle_error "Package installation"
    generate_migration_config || handle_error "Configuration generation"
    migrate_validation_schemas || handle_error "Schema migration"
    create_migration_tests || handle_error "Test creation"
    create_rollout_helper || handle_error "Rollout helper creation"
    create_migration_dashboard || handle_error "Dashboard creation"
    
    # Show summary
    show_migration_summary
}

# Trap errors and cleanup
trap 'handle_error "Unknown error occurred"' ERR

# Run main function
main "$@"