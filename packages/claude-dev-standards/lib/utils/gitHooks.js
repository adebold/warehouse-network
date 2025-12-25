const fs = require('fs-extra');
const path = require('path');
// Removed execa as it's not needed for this implementation

const hookScripts = {
  'pre-commit': `#!/bin/sh
# Claude Dev Standards pre-commit hook

echo "Running Claude Dev Standards validation..."
npx claude-dev-standards validate

if [ $? -ne 0 ]; then
  echo "❌ Validation failed. Please fix issues before committing."
  exit 1
fi

echo "✅ Validation passed!"
`,

  'pre-push': `#!/bin/sh
# Claude Dev Standards pre-push hook

echo "Running strict Claude Dev Standards validation..."
npx claude-dev-standards validate --strict

if [ $? -ne 0 ]; then
  echo "❌ Strict validation failed. Please fix all issues before pushing."
  exit 1
fi

echo "✅ All checks passed!"
`
};

async function install(projectPath) {
  const gitPath = path.join(projectPath, '.git');
  
  // Check if it's a git repository
  if (!await fs.exists(gitPath)) {
    throw new Error('Not a git repository. Run git init first.');
  }
  
  const hooksPath = path.join(gitPath, 'hooks');
  await fs.ensureDir(hooksPath);
  
  // Install hooks
  for (const [hookName, hookScript] of Object.entries(hookScripts)) {
    const hookPath = path.join(hooksPath, hookName);
    
    // Check if hook already exists
    if (await fs.exists(hookPath)) {
      const existingContent = await fs.readFile(hookPath, 'utf-8');
      if (existingContent.includes('claude-dev-standards')) {
        // Hook already installed
        continue;
      }
      
      // Append to existing hook
      const updatedContent = existingContent + '\n\n' + hookScript;
      await fs.writeFile(hookPath, updatedContent);
    } else {
      // Create new hook
      await fs.writeFile(hookPath, hookScript);
    }
    
    // Make executable
    await fs.chmod(hookPath, '755');
  }
  
  return true;
}

async function uninstall(projectPath) {
  const hooksPath = path.join(projectPath, '.git', 'hooks');
  
  if (!await fs.exists(hooksPath)) {
    return;
  }
  
  for (const hookName of Object.keys(hookScripts)) {
    const hookPath = path.join(hooksPath, hookName);
    
    if (await fs.exists(hookPath)) {
      const content = await fs.readFile(hookPath, 'utf-8');
      
      if (content.includes('claude-dev-standards')) {
        // Remove our section or entire file
        const lines = content.split('\n');
        const filteredLines = lines.filter(line => 
          !line.includes('Claude Dev Standards') && 
          !line.includes('claude-dev-standards')
        );
        
        if (filteredLines.join('\n').trim() === '#!/bin/sh' || filteredLines.length <= 1) {
          // Remove entire file if only our content
          await fs.remove(hookPath);
        } else {
          // Update file with filtered content
          await fs.writeFile(hookPath, filteredLines.join('\n'));
        }
      }
    }
  }
}

module.exports = {
  install,
  uninstall
};