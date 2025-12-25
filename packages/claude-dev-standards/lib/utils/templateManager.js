const fs = require('fs-extra');
const path = require('path');
const _ = require('lodash');

async function copyTemplate(templateName, targetPath, projectType) {
  const templateBasePath = path.join(__dirname, '../../templates', templateName);
  
  // Check for project-type specific template first
  let templatePath = path.join(templateBasePath + '.' + projectType);
  
  if (!await fs.exists(templatePath)) {
    // Fall back to generic template
    templatePath = templateBasePath;
    
    // If still doesn't exist, check if it's a directory
    if (!await fs.exists(templatePath)) {
      const files = await fs.readdir(path.dirname(templatePath));
      const templateFiles = files.filter(f => f.startsWith(path.basename(templateName)));
      
      if (templateFiles.length === 0) {
        throw new Error(`Template not found: ${templateName}`);
      }
      
      // Copy all matching files
      for (const file of templateFiles) {
        const src = path.join(path.dirname(templatePath), file);
        const dest = path.join(targetPath, file.replace(templateName + '.', ''));
        await fs.copy(src, dest);
      }
      return;
    }
  }
  
  // Copy single file or directory
  const targetFileName = path.basename(templateName);
  const targetFilePath = path.join(targetPath, targetFileName);
  
  await fs.copy(templatePath, targetFilePath);
}

async function copyTemplates(templates, targetPath, context) {
  for (const template of templates) {
    try {
      await copyTemplate(template, targetPath, context.projectType);
    } catch (error) {
      console.warn(`Warning: ${error.message}`);
    }
  }
}

async function processTemplate(templatePath, context) {
  let content = await fs.readFile(templatePath, 'utf-8');
  
  // Simple template processing (replace {{variable}})
  const compiled = _.template(content, {
    interpolate: /{{([\s\S]+?)}}/g
  });
  
  return compiled(context);
}

module.exports = {
  copyTemplate,
  copyTemplates,
  processTemplate
};