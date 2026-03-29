const fs = require('fs').promises;
const path = require('path');
const handlebars = require('handlebars');
const { execSync } = require('child_process');
const logger = require('../shared/utils/logger');

class SDKGenerator {
  constructor() {
    this.supportedLanguages = {
      javascript: {
        extension: 'js',
        packageFile: 'package.json',
        template: 'javascript.hbs',
        generator: 'javascript-sdk'
      },
      typescript: {
        extension: 'ts',
        packageFile: 'package.json',
        template: 'typescript.hbs',
        generator: 'typescript-sdk'
      },
      python: {
        extension: 'py',
        packageFile: 'setup.py',
        template: 'python.hbs',
        generator: 'python-sdk'
      },
      java: {
        extension: 'java',
        packageFile: 'pom.xml',
        template: 'java.hbs',
        generator: 'java-sdk'
      },
      csharp: {
        extension: 'cs',
        packageFile: 'ApiClient.csproj',
        template: 'csharp.hbs',
        generator: 'csharp-sdk'
      },
      go: {
        extension: 'go',
        packageFile: 'go.mod',
        template: 'go.hbs',
        generator: 'go-sdk'
      },
      php: {
        extension: 'php',
        packageFile: 'composer.json',
        template: 'php.hbs',
        generator: 'php-sdk'
      },
      ruby: {
        extension: 'rb',
        packageFile: 'Gemfile',
        template: 'ruby.hbs',
        generator: 'ruby-sdk'
      }
    };

    this.templateCache = new Map();
    this.loadTemplates();
  }

  /**
   * Load Handlebars templates
   */
  async loadTemplates() {
    try {
      const templatesDir = path.join(__dirname, 'templates');

      for (const [language, config] of Object.entries(this.supportedLanguages)) {
        const templatePath = path.join(templatesDir, config.template);

        try {
          const templateContent = await fs.readFile(templatePath, 'utf8');
          const compiledTemplate = handlebars.compile(templateContent);
          this.templateCache.set(language, compiledTemplate);
        } catch (error) {
          logger.warn(\`Template not found for \${language}: \${templatePath}\`);
        }
      }

      logger.info(\`Loaded \${this.templateCache.size} SDK templates\`);
    } catch (error) {
      logger.error('Error loading SDK templates:', error);
    }
  }

  /**
   * Generate SDK for multiple languages
   */
  async generateSDK(apiSpec, options = {}) {
    const {
      languages = ['javascript', 'python'],
      outputDir = './generated-sdks',
      apiName,
      apiVersion = '1.0.0',
      packageName,
      namespace,
      baseUrl,
      authentication = {},
      includeExamples = true,
      includeTests = true,
      format = 'openapi3'
    } = options;

    const results = {};

    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Process API specification
      const processedSpec = await this.processApiSpec(apiSpec, format);

      // Generate SDK for each language
      for (const language of languages) {
        try {
          logger.info(\`Generating \${language} SDK for \${apiName}\`);

          const sdkPath = path.join(outputDir, language);
          const result = await this.generateLanguageSDK(
            processedSpec,
            language,
            sdkPath,
            {
              apiName,
              apiVersion,
              packageName: packageName || this.generatePackageName(apiName, language),
              namespace: namespace || this.generateNamespace(apiName, language),
              baseUrl,
              authentication,
              includeExamples,
              includeTests
            }
          );

          results[language] = result;
          logger.info(\`\${language} SDK generated successfully: \${sdkPath}\`);

        } catch (error) {
          logger.error(\`Error generating \${language} SDK:\`, error);
          results[language] = { success: false, error: error.message };
        }
      }

      // Generate documentation
      if (options.generateDocs !== false) {
        await this.generateDocumentation(processedSpec, outputDir, options);
      }

      return {
        success: true,
        results,
        outputDir,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error generating SDKs:', error);
      throw error;
    }
  }

  /**
   * Generate SDK for specific language
   */
  async generateLanguageSDK(apiSpec, language, outputPath, options) {
    try {
      // Ensure language is supported
      if (!this.supportedLanguages[language]) {
        throw new Error(\`Unsupported language: \${language}\`);
      }

      const config = this.supportedLanguages[language];
      const template = this.templateCache.get(language);

      if (!template) {
        throw new Error(\`Template not found for \${language}\`);
      }

      // Create output directory
      await fs.mkdir(outputPath, { recursive: true });

      // Prepare template data
      const templateData = this.prepareTemplateData(apiSpec, language, options);

      // Generate main SDK files
      await this.generateSDKFiles(template, templateData, outputPath, config);

      // Generate package configuration
      await this.generatePackageConfig(language, outputPath, options);

      // Generate examples if requested
      if (options.includeExamples) {
        await this.generateExamples(apiSpec, language, outputPath, options);
      }

      // Generate tests if requested
      if (options.includeTests) {
        await this.generateTests(apiSpec, language, outputPath, options);
      }

      return {
        success: true,
        language,
        outputPath,
        files: await this.getGeneratedFiles(outputPath),
        packageFile: config.packageFile
      };

    } catch (error) {
      logger.error(\`Error generating \${language} SDK:\`, error);
      throw error;
    }
  }

  /**
   * Process API specification
   */
  async processApiSpec(apiSpec, format) {
    try {
      let spec = apiSpec;

      // If spec is a string (URL or file path), load it
      if (typeof spec === 'string') {
        if (spec.startsWith('http')) {
          // Load from URL
          const response = await fetch(spec);
          spec = await response.json();
        } else {
          // Load from file
          const content = await fs.readFile(spec, 'utf8');
          spec = JSON.parse(content);
        }
      }

      // Validate and normalize specification
      const processedSpec = {
        info: spec.info || { title: 'API', version: '1.0.0' },
        servers: spec.servers || [{ url: 'https://api.example.com' }],
        paths: spec.paths || {},
        components: spec.components || {},
        security: spec.security || [],
        tags: spec.tags || []
      };

      // Extract endpoints information
      processedSpec.endpoints = this.extractEndpoints(processedSpec);

      // Extract models/schemas
      processedSpec.models = this.extractModels(processedSpec);

      return processedSpec;

    } catch (error) {
      logger.error('Error processing API spec:', error);
      throw error;
    }
  }

  /**
   * Extract endpoints from OpenAPI spec
   */
  extractEndpoints(spec) {
    const endpoints = [];

    for (const [path, pathItem] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (typeof operation === 'object' && operation.operationId) {
          endpoints.push({
            path,
            method: method.toUpperCase(),
            operationId: operation.operationId,
            summary: operation.summary,
            description: operation.description,
            parameters: operation.parameters || [],
            requestBody: operation.requestBody,
            responses: operation.responses || {},
            tags: operation.tags || [],
            security: operation.security || spec.security
          });
        }
      }
    }

    return endpoints;
  }

  /**
   * Extract models from OpenAPI spec
   */
  extractModels(spec) {
    const models = [];

    if (spec.components && spec.components.schemas) {
      for (const [name, schema] of Object.entries(spec.components.schemas)) {
        models.push({
          name,
          type: schema.type || 'object',
          properties: schema.properties || {},
          required: schema.required || [],
          description: schema.description,
          example: schema.example
        });
      }
    }

    return models;
  }

  /**
   * Prepare template data for rendering
   */
  prepareTemplateData(apiSpec, language, options) {
    const config = this.supportedLanguages[language];

    return {
      apiName: options.apiName || apiSpec.info.title,
      apiVersion: options.apiVersion || apiSpec.info.version,
      apiDescription: apiSpec.info.description,
      packageName: options.packageName,
      namespace: options.namespace,
      baseUrl: options.baseUrl || apiSpec.servers[0]?.url,
      language,
      config,
      endpoints: apiSpec.endpoints,
      models: apiSpec.models,
      authentication: options.authentication,
      timestamp: new Date().toISOString(),
      generatorVersion: process.env.npm_package_version || '1.0.0'
    };
  }

  /**
   * Generate SDK files from template
   */
  async generateSDKFiles(template, templateData, outputPath, config) {
    try {
      // Generate main SDK file
      const sdkContent = template(templateData);
      const mainFile = path.join(outputPath, \`client.\${config.extension}\`);
      await fs.writeFile(mainFile, sdkContent);

      // Generate additional files based on language
      await this.generateAdditionalFiles(templateData, outputPath, config);

    } catch (error) {
      logger.error('Error generating SDK files:', error);
      throw error;
    }
  }

  /**
   * Generate additional language-specific files
   */
  async generateAdditionalFiles(templateData, outputPath, config) {
    const { language } = templateData;

    switch (language) {
      case 'javascript':
      case 'typescript':
        await this.generateJavaScriptFiles(templateData, outputPath);
        break;
      case 'python':
        await this.generatePythonFiles(templateData, outputPath);
        break;
      case 'java':
        await this.generateJavaFiles(templateData, outputPath);
        break;
      case 'csharp':
        await this.generateCSharpFiles(templateData, outputPath);
        break;
      case 'go':
        await this.generateGoFiles(templateData, outputPath);
        break;
      case 'php':
        await this.generatePHPFiles(templateData, outputPath);
        break;
      case 'ruby':
        await this.generateRubyFiles(templateData, outputPath);
        break;
    }
  }

  /**
   * Generate JavaScript/TypeScript specific files
   */
  async generateJavaScriptFiles(templateData, outputPath) {
    // Generate index.js
    const indexContent = \`module.exports = require('./client');\`;
    await fs.writeFile(path.join(outputPath, 'index.js'), indexContent);

    // Generate README.md
    const readmeContent = this.generateReadme(templateData);
    await fs.writeFile(path.join(outputPath, 'README.md'), readmeContent);
  }

  /**
   * Generate Python specific files
   */
  async generatePythonFiles(templateData, outputPath) {
    // Generate __init__.py
    const initContent = \`from .client import \${templateData.namespace}Client\n__all__ = ['\${templateData.namespace}Client']\`;
    await fs.writeFile(path.join(outputPath, '__init__.py'), initContent);

    // Generate README.md
    const readmeContent = this.generateReadme(templateData);
    await fs.writeFile(path.join(outputPath, 'README.md'), readmeContent);
  }

  /**
   * Generate package configuration files
   */
  async generatePackageConfig(language, outputPath, options) {
    const config = this.supportedLanguages[language];
    const packagePath = path.join(outputPath, config.packageFile);

    let packageContent;

    switch (language) {
      case 'javascript':
      case 'typescript':
        packageContent = this.generatePackageJson(options);
        break;
      case 'python':
        packageContent = this.generateSetupPy(options);
        break;
      case 'java':
        packageContent = this.generatePomXml(options);
        break;
      case 'csharp':
        packageContent = this.generateCsproj(options);
        break;
      case 'go':
        packageContent = this.generateGoMod(options);
        break;
      case 'php':
        packageContent = this.generateComposerJson(options);
        break;
      case 'ruby':
        packageContent = this.generateGemfile(options);
        break;
      default:
        return; // Skip unknown languages
    }

    await fs.writeFile(packagePath, packageContent);
  }

  /**
   * Generate package.json for JavaScript/TypeScript
   */
  generatePackageJson(options) {
    return JSON.stringify({
      name: options.packageName,
      version: options.apiVersion,
      description: \`SDK for \${options.apiName} API\`,
      main: 'index.js',
      types: 'index.d.ts',
      scripts: {
        test: 'jest',
        build: 'tsc'
      },
      keywords: ['api', 'sdk', 'client'],
      author: 'API Platform',
      license: 'MIT',
      dependencies: {
        axios: '^1.5.0'
      },
      devDependencies: {
        jest: '^29.7.0',
        '@types/jest': '^29.5.0',
        typescript: '^5.0.0'
      }
    }, null, 2);
  }

  /**
   * Generate setup.py for Python
   */
  generateSetupPy(options) {
    return \`from setuptools import setup, find_packages

setup(
    name="\${options.packageName}",
    version="\${options.apiVersion}",
    description="SDK for \${options.apiName} API",
    packages=find_packages(),
    install_requires=[
        "requests>=2.25.0",
        "python-dateutil>=2.8.0"
    ],
    python_requires=">=3.7",
    author="API Platform",
    license="MIT",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
    ]
)\`;
  }

  /**
   * Generate README for SDK
   */
  generateReadme(templateData) {
    return \`# \${templateData.apiName} SDK

Auto-generated SDK for \${templateData.apiName} API.

## Installation

\\\`\\\`\\\`bash
# For JavaScript/Node.js
npm install \${templateData.packageName}

# For Python
pip install \${templateData.packageName}
\\\`\\\`\\\`

## Usage

\\\`\\\`\\\`\${templateData.language}
// Example usage code here
\\\`\\\`\\\`

## API Reference

This SDK provides access to the following endpoints:

\${templateData.endpoints.map(endpoint => \`- \${endpoint.method} \${endpoint.path}\`).join('\n')}

## Support

For support, please contact the API team or visit our documentation.

Generated on: \${templateData.timestamp}
Generator Version: \${templateData.generatorVersion}
\`;
  }

  /**
   * Generate helper methods
   */
  generatePackageName(apiName, language) {
    const name = apiName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return language === 'java' ? \`com.api.\${name}\` : \`\${name}-sdk\`;
  }

  generateNamespace(apiName, language) {
    const name = apiName.replace(/[^a-zA-Z0-9]/g, '');
    return \`\${name}API\`;
  }

  /**
   * Get list of generated files
   */
  async getGeneratedFiles(outputPath) {
    try {
      const files = [];
      const items = await fs.readdir(outputPath, { withFileTypes: true });

      for (const item of items) {
        if (item.isFile()) {
          const stats = await fs.stat(path.join(outputPath, item.name));
          files.push({
            name: item.name,
            size: stats.size,
            modified: stats.mtime
          });
        }
      }

      return files;
    } catch (error) {
      logger.error('Error getting generated files:', error);
      return [];
    }
  }

  /**
   * Generate examples
   */
  async generateExamples(apiSpec, language, outputPath, options) {
    const examplesDir = path.join(outputPath, 'examples');
    await fs.mkdir(examplesDir, { recursive: true });

    // Generate example for each endpoint
    for (const endpoint of apiSpec.endpoints.slice(0, 5)) { // Limit to first 5 endpoints
      const exampleContent = this.generateEndpointExample(endpoint, language, options);
      const fileName = \`\${endpoint.operationId}_example.\${this.supportedLanguages[language].extension}\`;
      await fs.writeFile(path.join(examplesDir, fileName), exampleContent);
    }
  }

  /**
   * Generate tests
   */
  async generateTests(apiSpec, language, outputPath, options) {
    const testsDir = path.join(outputPath, 'tests');
    await fs.mkdir(testsDir, { recursive: true });

    const testContent = this.generateTestSuite(apiSpec, language, options);
    const fileName = \`client.test.\${this.supportedLanguages[language].extension}\`;
    await fs.writeFile(path.join(testsDir, fileName), testContent);
  }

  generateEndpointExample(endpoint, language, options) {
    // Generate language-specific example code
    switch (language) {
      case 'javascript':
        return \`const client = new \${options.namespace}Client({ baseUrl: '\${options.baseUrl}' });
const result = await client.\${endpoint.operationId}();
console.log(result);\`;
      case 'python':
        return \`from \${options.packageName} import \${options.namespace}Client
client = \${options.namespace}Client(base_url='\${options.baseUrl}')
result = client.\${endpoint.operationId}()
print(result)\`;
      default:
        return \`// Example for \${endpoint.operationId}\`;
    }
  }

  generateTestSuite(apiSpec, language, options) {
    // Generate basic test suite structure
    return \`// Test suite for \${options.apiName} SDK
// Generated automatically - customize as needed\`;
  }

  /**
   * Generate documentation
   */
  async generateDocumentation(apiSpec, outputDir, options) {
    const docsDir = path.join(outputDir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });

    // Generate API documentation
    const docContent = this.generateApiDocs(apiSpec);
    await fs.writeFile(path.join(docsDir, 'API.md'), docContent);
  }

  generateApiDocs(apiSpec) {
    return \`# API Documentation

## Endpoints

\${apiSpec.endpoints.map(endpoint => \`
### \${endpoint.method} \${endpoint.path}

\${endpoint.description || ''}

**Operation ID:** \${endpoint.operationId}
\`).join('\n')}
\`;
  }
}

module.exports = SDKGenerator;