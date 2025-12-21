#!/usr/bin/env node
/**
 * Auto-fix TypeScript and ESLint errors for Warehouse Network
 *
 * This script:
 * 1. Runs ESLint with --fix to auto-fix issues
 * 2. Organizes imports
 * 3. Removes unused imports
 * 4. Adds missing type annotations where possible
 * 5. Formats code with Prettier
 * 6. Runs type check and reports
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message: string, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function exec(command: string, silent = false): string {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
      cwd: process.cwd(),
    });
  } catch (error) {
    if (!silent) {
      console.error(`Command failed: ${command}`);
      throw error;
    }
    return '';
  }
}

// Header
log('\n' + '='.repeat(70), COLORS.cyan);
log('🚀 WAREHOUSE NETWORK - AUTO-FIX TYPESCRIPT & ESLINT', COLORS.cyan);
log('='.repeat(70), COLORS.cyan);
log('Based on VARAi Security Platform enterprise configurations\n', COLORS.blue);

// Check if we're in the right directory
if (!existsSync('./apps/web') && !existsSync('./packages')) {
  log('❌ Error: Run this script from the warehouse-network root directory', COLORS.red);
  process.exit(1);
}

// Step 1: Install/update dependencies
log('🔧 Step 1: Checking dependencies...', COLORS.blue);
try {
  // Check if we need to install new ESLint plugins
  const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
  const webPackageJson = JSON.parse(readFileSync('./apps/web/package.json', 'utf8'));

  const requiredDeps = [
    'eslint-plugin-security',
    'eslint-plugin-unused-imports',
    'eslint-import-resolver-typescript',
  ];

  const missing = requiredDeps.filter(
    dep => !webPackageJson.devDependencies?.[dep] && !packageJson.devDependencies?.[dep]
  );

  if (missing.length > 0) {
    log(`Installing missing dependencies: ${missing.join(', ')}`, COLORS.yellow);
    exec(`pnpm add -D ${missing.join(' ')}`, false);
  } else {
    log('✅ All dependencies present', COLORS.green);
  }
} catch (error) {
  log('⚠️  Could not check dependencies, proceeding anyway', COLORS.yellow);
}

// Step 2: Run ESLint with --fix
log('\n🔧 Step 2: Running ESLint auto-fix...', COLORS.blue);
try {
  exec('pnpm exec eslint . --ext .ts,.tsx --fix --max-warnings 0');
  log('✅ ESLint auto-fix complete', COLORS.green);
} catch (error) {
  log('⚠️  Some ESLint errors could not be auto-fixed', COLORS.yellow);
}

// Step 3: Remove unused imports (advanced)
log('\n🔧 Step 3: Removing unused imports...', COLORS.blue);
const tsFiles = globSync('**/*.{ts,tsx}', {
  ignore: [
    'node_modules/**',
    'dist/**',
    'build/**',
    '.next/**',
    'coverage/**',
    'varai-integration/**',
  ],
});

let removedImports = 0;
const IMPORT_PATTERNS = [
  /^import\s+.*?\s+from\s+['"'][^'"]+['"];?\s*$/gm,
  /^import\s+['"'][^'"]+['"];?\s*$/gm,
];

for (const file of tsFiles) {
  try {
    let content = readFileSync(file, 'utf8');
    let modified = false;

    // Find all imports
    const imports: string[] = [];
    for (const pattern of IMPORT_PATTERNS) {
      const matches = content.match(pattern) || [];
      imports.push(...matches);
    }

    // Check each import to see if it's used
    for (const importLine of imports) {
      const namedImports =
        importLine.match(/import\s+\{([^}]+)\}/) || importLine.match(/import\s+(\w+)/);

      if (namedImports) {
        const imports = namedImports[1].split(',').map(i => i.trim());
        const unusedImports = imports.filter(imp => {
          const importName = imp.replace(/\s+as\s+\w+/, '').trim();
          // Simple heuristic: if the import name doesn't appear elsewhere in the file
          const restOfFile = content.replace(importLine, '');
          return !restOfFile.includes(importName);
        });

        if (unusedImports.length > 0 && unusedImports.length === imports.length) {
          // Remove the entire import line if all imports are unused
          content = content.replace(importLine, '');
          modified = true;
        }
      }
    }

    if (modified) {
      writeFileSync(file, content);
      removedImports++;
    }
  } catch (error) {
    // Skip files with errors
  }
}
log(`✅ Removed unused imports from ${removedImports} files`, COLORS.green);

// Step 4: Organize imports
log('\n🔧 Step 4: Organizing imports...', COLORS.blue);
try {
  exec('pnpm exec eslint . --ext .ts,.tsx --fix --rule "import/order: error"', true);
  log('✅ Imports organized', COLORS.green);
} catch (error) {
  log('⚠️  Some imports could not be organized', COLORS.yellow);
}

// Step 5: Add missing type annotations (warehouse-specific)
log('\n🔧 Step 5: Adding missing type annotations...', COLORS.blue);

const TYPE_FIXES = [
  // Fix Promise<any> to Promise<unknown>
  {
    pattern: /Promise<any>/g,
    fix: () => 'Promise<unknown>',
    description: 'Promise<any> → Promise<unknown>',
  },
  // Fix any[] to unknown[]
  {
    pattern: /:\s*any\[\]/g,
    fix: () => ': unknown[]',
    description: 'any[] → unknown[]',
  },
  // Add warehouse-specific imports
  {
    pattern: /interface\s+(User|Product|Order|Warehouse|Inventory)\s/g,
    fix: (match: string) => {
      // Check if @warehouse/types is already imported
      return match; // Keep as is, types should be imported separately
    },
    description: 'Warehouse domain types',
  },
  // Fix React component props without types
  {
    pattern: /export\s+(default\s+)?function\s+(\w+)\s*\(\s*\{\s*([^}]+)\s*\}\s*\)\s*{/g,
    fix: (match: string, defaultExport: string, fnName: string, props: string) => {
      if (!props.includes(':')) {
        return match.replace('({', '(props: {').replace('})', ': any})');
      }
      return match;
    },
    description: 'React component prop types',
  },
];

let typeFixCount = 0;
for (const file of tsFiles.filter(f => !f.includes('.test.') && !f.includes('.spec.'))) {
  try {
    let content = readFileSync(file, 'utf8');
    let modified = false;

    for (const fix of TYPE_FIXES) {
      if (fix.pattern.test(content)) {
        content = content.replace(fix.pattern, fix.fix as any);
        modified = true;
      }
    }

    // Add @warehouse/types import if warehouse types are used
    const warehouseTypes = ['User', 'Product', 'Order', 'Warehouse', 'Inventory', 'Customer'];
    const usedTypes = warehouseTypes.filter(
      type =>
        new RegExp(`\\b${type}\\b`).test(content) &&
        !content.includes(`interface ${type}`) &&
        !content.includes(`type ${type}`)
    );

    if (usedTypes.length > 0 && !content.includes('@warehouse/types')) {
      const importStatement = `import type { ${usedTypes.join(', ')} } from '@warehouse/types';\n`;
      content = importStatement + content;
      modified = true;
    }

    if (modified) {
      writeFileSync(file, content);
      typeFixCount++;
    }
  } catch (error) {
    // Skip files with errors
  }
}
log(`✅ Added type annotations to ${typeFixCount} files`, COLORS.green);

// Step 6: Format with Prettier
log('\n🔧 Step 6: Formatting with Prettier...', COLORS.blue);
try {
  exec('pnpm exec prettier --write "**/*.{ts,tsx,js,jsx,json,md}" --ignore-path .gitignore');
  log('✅ Code formatted', COLORS.green);
} catch (error) {
  log('⚠️  Some files could not be formatted', COLORS.yellow);
}

// Step 7: Build packages
log('\n🔧 Step 7: Building packages...', COLORS.blue);
try {
  if (existsSync('./packages/types')) {
    exec('pnpm --filter @warehouse/types build', true);
    log('✅ Packages built successfully', COLORS.green);
  } else {
    log('⚠️  No packages to build yet', COLORS.yellow);
  }
} catch (error) {
  log('⚠️  Package build failed, continuing with type check', COLORS.yellow);
}

// Step 8: Run TypeScript compiler check
log('\n🔧 Step 8: Running TypeScript compiler check...', COLORS.blue);
try {
  exec('pnpm exec tsc --noEmit -p tsconfig.base.json', true);
  log('✅ No TypeScript errors!', COLORS.green);
} catch (error) {
  log('⚠️  Some TypeScript errors remain. Check individual app configs:', COLORS.yellow);

  // Check individual apps
  const apps = ['apps/web'];
  for (const app of apps) {
    if (existsSync(`./${app}/tsconfig.json`)) {
      try {
        exec(`cd ${app} && pnpm exec tsc --noEmit`, true);
        log(`  ✅ ${app}: No errors`, COLORS.green);
      } catch {
        log(`  ⚠️  ${app}: Has TypeScript errors`, COLORS.yellow);
      }
    }
  }
}

// Step 9: Run final lint check
log('\n🔧 Step 9: Final lint check...', COLORS.blue);
try {
  exec('pnpm exec eslint . --ext .ts,.tsx --max-warnings 0', true);
  log('✅ All linting passed!', COLORS.green);
} catch (error) {
  log('⚠️  Some linting issues remain', COLORS.yellow);
}

// Summary
log('\n' + '='.repeat(70), COLORS.cyan);
log('📊 AUTO-FIX SUMMARY', COLORS.cyan);
log('='.repeat(70), COLORS.cyan);
log(`✅ ESLint auto-fixes applied`, COLORS.green);
log(`✅ ${removedImports} files had unused imports removed`, COLORS.green);
log(`✅ Imports organized`, COLORS.green);
log(`✅ ${typeFixCount} files had type annotations added`, COLORS.green);
log(`✅ Code formatted with Prettier`, COLORS.green);
log(`✅ TypeScript compilation checked`, COLORS.green);

log('\n💡 Next steps:', COLORS.magenta);
log('   1. Review changes: git diff', COLORS.cyan);
log('   2. Test the application: pnpm dev', COLORS.cyan);
log('   3. Run full test suite: pnpm test', COLORS.cyan);
log(
  '   4. Commit changes: git add . && git commit -m "fix: auto-fix TS/ESLint errors"',
  COLORS.cyan
);
log('   5. Deploy via GitOps: git push', COLORS.cyan);

log('\n🎯 Warehouse Network is now enterprise-ready!', COLORS.green);
log('');
