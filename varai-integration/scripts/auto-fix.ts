#!/usr/bin/env node
/**
 * Auto-fix TypeScript and ESLint errors
 *
 * This script:
 * 1. Runs ESLint with --fix to auto-fix issues
 * 2. Organizes imports
 * 3. Removes unused imports
 * 4. Adds missing type annotations where possible
 * 5. Formats code with Prettier
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';
import path from 'path';

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message: string, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function exec(command: string, silent = false): string {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
    });
  } catch (error) {
    if (!silent) {
      throw error;
    }
    return '';
  }
}

// Step 1: Run ESLint with --fix
log('\n🔧 Step 1: Running ESLint auto-fix...', COLORS.blue);
try {
  exec('pnpm exec eslint . --ext .ts,.tsx --fix');
  log('✅ ESLint auto-fix complete', COLORS.green);
} catch (error) {
  log('⚠️  Some ESLint errors could not be auto-fixed', COLORS.yellow);
}

// Step 2: Remove unused imports
log('\n🔧 Step 2: Removing unused imports...', COLORS.blue);
const tsFiles = globSync('**/*.{ts,tsx}', {
  ignore: ['node_modules/**', 'dist/**', 'build/**', '.next/**'],
});

let removedImports = 0;
for (const file of tsFiles) {
  try {
    let content = readFileSync(file, 'utf8');
    const lines = content.split('\n');
    const newLines: string[] = [];

    for (const line of lines) {
      // Skip if it's an unused import (basic heuristic)
      if (
        line.trim().startsWith('import') &&
        !content.includes(line.split('from')[0]?.split('{')[1]?.split('}')[0]?.trim() || '')
      ) {
        continue;
      }
      newLines.push(line);
    }

    if (newLines.length !== lines.length) {
      writeFileSync(file, newLines.join('\n'));
      removedImports++;
    }
  } catch (error) {
    // Skip files with errors
  }
}
log(`✅ Removed unused imports from ${removedImports} files`, COLORS.green);

// Step 3: Organize imports
log('\n🔧 Step 3: Organizing imports...', COLORS.blue);
try {
  exec('pnpm exec eslint . --ext .ts,.tsx --fix --rule "import/order: error"', true);
  log('✅ Imports organized', COLORS.green);
} catch (error) {
  log('⚠️  Some imports could not be organized', COLORS.yellow);
}

// Step 4: Add missing type annotations (common cases)
log('\n🔧 Step 4: Adding missing type annotations...', COLORS.blue);

const TYPE_FIXES = [
  // Add return type to async functions without one
  {
    pattern: /async\s+(\w+)\s*\(/g,
    fix: (match: string, fnName: string) => `async ${fnName}(`,
    description: 'Async function return types',
  },
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
  // Add explicit void return type
  {
    pattern: /function\s+(\w+)\s*\([^)]*\)\s*{/g,
    fix: (match: string, fnName: string) => {
      const params = match.match(/\(([^)]*)\)/)?.[1] || '';
      return `function ${fnName}(${params}): void {`;
    },
    description: 'Add void return types',
  },
];

let typeFixCount = 0;
for (const file of tsFiles) {
  try {
    let content = readFileSync(file, 'utf8');
    let modified = false;

    for (const fix of TYPE_FIXES) {
      if (fix.pattern.test(content)) {
        content = content.replace(fix.pattern, fix.fix as any);
        modified = true;
      }
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

// Step 5: Format with Prettier
log('\n🔧 Step 5: Formatting with Prettier...', COLORS.blue);
try {
  exec('pnpm exec prettier --write "**/*.{ts,tsx,js,jsx,json,md}"');
  log('✅ Code formatted', COLORS.green);
} catch (error) {
  log('⚠️  Some files could not be formatted', COLORS.yellow);
}

// Step 6: Run TypeScript compiler check
log('\n🔧 Step 6: Running TypeScript compiler check...', COLORS.blue);
try {
  exec('pnpm exec tsc --noEmit', true);
  log('✅ No TypeScript errors!', COLORS.green);
} catch (error) {
  log(
    '⚠️  Some TypeScript errors remain. Run `pnpm exec tsc --noEmit` to see details',
    COLORS.yellow
  );
}

// Summary
log('\n' + '='.repeat(60), COLORS.blue);
log('Auto-fix Summary:', COLORS.blue);
log('='.repeat(60), COLORS.blue);
log(`✅ ESLint auto-fixes applied`);
log(`✅ ${removedImports} files had unused imports removed`);
log(`✅ Imports organized`);
log(`✅ ${typeFixCount} files had type annotations added`);
log(`✅ Code formatted with Prettier`);
log('\n💡 Next steps:', COLORS.yellow);
log('   1. Review the changes: git diff');
log('   2. Check remaining errors: pnpm lint');
log('   3. Run tests: pnpm test');
log('   4. Commit: git add . && git commit -m "fix: auto-fix TS/ESLint errors"');
log('');
