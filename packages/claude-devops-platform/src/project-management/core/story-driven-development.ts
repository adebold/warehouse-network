/**
 * Story-Driven Development
 * Generates code, tests, and documentation from user stories
 */

import { UserStory, AcceptanceCriteria, TestCase } from './types';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';

export interface CodeGenerationOptions {
  language: 'typescript' | 'javascript' | 'python' | 'java';
  framework?: string;
  testFramework?: string;
  style?: 'functional' | 'class-based' | 'mixed';
  includeComments?: boolean;
  includeTypes?: boolean;
}

export interface GeneratedCode {
  mainCode: GeneratedFile[];
  testCode: GeneratedFile[];
  documentation: GeneratedFile[];
  scaffolding: GeneratedFile[];
}

export interface GeneratedFile {
  path: string;
  content: string;
  type: 'source' | 'test' | 'doc' | 'config';
}

export class StoryDrivenDevelopment {
  private templates: Map<string, Handlebars.TemplateDelegate> = new Map();

  constructor() {
    this.loadTemplates();
  }

  /**
   * Generate code scaffolding from user story
   */
  async generateFromStory(
    story: UserStory,
    options: CodeGenerationOptions
  ): Promise<GeneratedCode> {
    // Use Claude Flow to analyze story and generate code
    const analysis = await this.analyzeStory(story);
    
    const generated: GeneratedCode = {
      mainCode: [],
      testCode: [],
      documentation: [],
      scaffolding: []
    };

    // Generate main implementation
    const mainFiles = await this.generateImplementation(story, analysis, options);
    generated.mainCode.push(...mainFiles);

    // Generate tests from acceptance criteria
    const testFiles = await this.generateTests(story, analysis, options);
    generated.testCode.push(...testFiles);

    // Generate documentation
    const docFiles = await this.generateDocumentation(story, analysis);
    generated.documentation.push(...docFiles);

    // Generate scaffolding (routes, controllers, etc.)
    const scaffoldingFiles = await this.generateScaffolding(story, analysis, options);
    generated.scaffolding.push(...scaffoldingFiles);

    return generated;
  }

  /**
   * Generate tests from acceptance criteria
   */
  async generateTestsFromAcceptanceCriteria(
    criteria: AcceptanceCriteria[],
    options: CodeGenerationOptions
  ): Promise<GeneratedFile[]> {
    const testFiles: GeneratedFile[] = [];

    for (const criterion of criteria) {
      if (!criterion.testable) continue;

      const tests = await this.generateTestsForCriterion(criterion, options);
      testFiles.push(...tests);
    }

    return testFiles;
  }

  /**
   * Generate API documentation from user stories
   */
  async generateAPIDocumentation(stories: UserStory[]): Promise<GeneratedFile[]> {
    const apiDocs: GeneratedFile[] = [];

    // Group stories by feature/module
    const grouped = this.groupStoriesByFeature(stories);

    for (const [feature, featureStories] of grouped) {
      const doc = await this.generateFeatureAPIDoc(feature, featureStories);
      apiDocs.push(doc);
    }

    // Generate OpenAPI specification
    const openApiSpec = await this.generateOpenAPISpec(stories);
    apiDocs.push({
      path: 'docs/openapi.yaml',
      content: openApiSpec,
      type: 'doc'
    });

    return apiDocs;
  }

  /**
   * Generate code from user flow
   */
  async generateFromUserFlow(
    flow: string,
    options: CodeGenerationOptions
  ): Promise<GeneratedCode> {
    // Use Claude Flow to parse user flow and generate code
    const flowAnalysis = await this.analyzeUserFlow(flow);
    
    return this.generateFromFlowAnalysis(flowAnalysis, options);
  }

  /**
   * Private helper methods
   */
  private async analyzeStory(story: UserStory): Promise<any> {
    // Use Claude Flow to analyze story
    const command = `npx claude-flow@alpha sparc run architecture "Analyze story: ${story.title}"`;
    
    try {
      const result = execSync(command, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch {
      // Fallback analysis
      return {
        entities: this.extractEntities(story),
        actions: this.extractActions(story),
        validations: this.extractValidations(story),
        integrations: []
      };
    }
  }

  private async generateImplementation(
    story: UserStory,
    analysis: any,
    options: CodeGenerationOptions
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    // Generate entity/model files
    for (const entity of analysis.entities) {
      const modelFile = await this.generateModel(entity, options);
      files.push(modelFile);
    }

    // Generate service/logic files
    for (const action of analysis.actions) {
      const serviceFile = await this.generateService(action, options);
      files.push(serviceFile);
    }

    // Generate API endpoints if needed
    if (analysis.needsAPI) {
      const apiFiles = await this.generateAPIEndpoints(story, analysis, options);
      files.push(...apiFiles);
    }

    return files;
  }

  private async generateTests(
    story: UserStory,
    analysis: any,
    options: CodeGenerationOptions
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    // Unit tests for each component
    for (const entity of analysis.entities) {
      const unitTest = await this.generateUnitTest(entity, options);
      files.push(unitTest);
    }

    // Integration tests from acceptance criteria
    for (const criterion of story.acceptanceCriteria) {
      if (criterion.testCases) {
        const integrationTest = await this.generateIntegrationTest(criterion, options);
        files.push(integrationTest);
      }
    }

    // E2E tests for user flows
    const e2eTest = await this.generateE2ETest(story, options);
    files.push(e2eTest);

    return files;
  }

  private async generateDocumentation(
    story: UserStory,
    analysis: any
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    // README for the feature
    const readme = this.generateReadme(story, analysis);
    files.push({
      path: `docs/features/${this.slugify(story.title)}.md`,
      content: readme,
      type: 'doc'
    });

    // API documentation if applicable
    if (analysis.needsAPI) {
      const apiDoc = this.generateAPIDoc(story, analysis);
      files.push({
        path: `docs/api/${this.slugify(story.title)}.md`,
        content: apiDoc,
        type: 'doc'
      });
    }

    return files;
  }

  private async generateScaffolding(
    story: UserStory,
    analysis: any,
    options: CodeGenerationOptions
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    // Database migrations
    if (analysis.entities.length > 0) {
      const migration = await this.generateMigration(analysis.entities, options);
      files.push(migration);
    }

    // Configuration files
    const configs = await this.generateConfigs(story, options);
    files.push(...configs);

    // Docker setup if needed
    if (analysis.needsDocker) {
      const dockerFiles = await this.generateDockerFiles(story, analysis);
      files.push(...dockerFiles);
    }

    return files;
  }

  private async generateTestsForCriterion(
    criterion: AcceptanceCriteria,
    options: CodeGenerationOptions
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    if (!criterion.testCases || criterion.testCases.length === 0) {
      // Generate test cases using Claude Flow
      criterion.testCases = await this.generateTestCases(criterion);
    }

    const testContent = this.renderTestTemplate(criterion, options);
    files.push({
      path: `tests/acceptance/${this.slugify(criterion.description)}.test.${options.language}`,
      content: testContent,
      type: 'test'
    });

    return files;
  }

  private async generateTestCases(criterion: AcceptanceCriteria): Promise<TestCase[]> {
    // Use Claude Flow to generate test cases
    const command = `npx claude-flow@alpha sparc run tester "Generate test cases for: ${criterion.description}"`;
    
    try {
      const result = execSync(command, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch {
      // Fallback test case
      return [{
        id: `tc-${Date.now()}`,
        given: 'the system is in a valid state',
        when: 'the criterion is tested',
        then: 'it should pass',
        status: 'pending'
      }];
    }
  }

  private generateModel(entity: any, options: CodeGenerationOptions): GeneratedFile {
    const template = this.templates.get(`model-${options.language}`);
    if (!template) {
      throw new Error(`Template not found for model-${options.language}`);
    }

    const content = template({
      entity,
      options,
      timestamp: new Date().toISOString()
    });

    return {
      path: `src/models/${entity.name}.${options.language}`,
      content,
      type: 'source'
    };
  }

  private generateService(action: any, options: CodeGenerationOptions): GeneratedFile {
    const template = this.templates.get(`service-${options.language}`);
    if (!template) {
      throw new Error(`Template not found for service-${options.language}`);
    }

    const content = template({
      action,
      options,
      timestamp: new Date().toISOString()
    });

    return {
      path: `src/services/${action.name}Service.${options.language}`,
      content,
      type: 'source'
    };
  }

  private async generateAPIEndpoints(
    story: UserStory,
    analysis: any,
    options: CodeGenerationOptions
  ): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    // Generate controller
    const controllerTemplate = this.templates.get(`controller-${options.language}`);
    if (controllerTemplate) {
      files.push({
        path: `src/controllers/${this.slugify(story.title)}Controller.${options.language}`,
        content: controllerTemplate({ story, analysis, options }),
        type: 'source'
      });
    }

    // Generate routes
    const routesTemplate = this.templates.get(`routes-${options.language}`);
    if (routesTemplate) {
      files.push({
        path: `src/routes/${this.slugify(story.title)}.${options.language}`,
        content: routesTemplate({ story, analysis, options }),
        type: 'source'
      });
    }

    return files;
  }

  private generateUnitTest(entity: any, options: CodeGenerationOptions): GeneratedFile {
    const template = this.templates.get(`unit-test-${options.language}`);
    if (!template) {
      throw new Error(`Template not found for unit-test-${options.language}`);
    }

    const content = template({
      entity,
      options,
      testFramework: options.testFramework || 'jest'
    });

    return {
      path: `tests/unit/${entity.name}.test.${options.language}`,
      content,
      type: 'test'
    };
  }

  private generateIntegrationTest(
    criterion: AcceptanceCriteria,
    options: CodeGenerationOptions
  ): GeneratedFile {
    const template = this.templates.get(`integration-test-${options.language}`);
    if (!template) {
      throw new Error(`Template not found for integration-test-${options.language}`);
    }

    const content = template({
      criterion,
      options,
      testFramework: options.testFramework || 'jest'
    });

    return {
      path: `tests/integration/${this.slugify(criterion.description)}.test.${options.language}`,
      content,
      type: 'test'
    };
  }

  private generateE2ETest(story: UserStory, options: CodeGenerationOptions): GeneratedFile {
    const template = this.templates.get(`e2e-test-${options.language}`);
    if (!template) {
      throw new Error(`Template not found for e2e-test-${options.language}`);
    }

    const content = template({
      story,
      options,
      testFramework: options.testFramework || 'cypress'
    });

    return {
      path: `tests/e2e/${this.slugify(story.title)}.e2e.${options.language}`,
      content,
      type: 'test'
    };
  }

  private generateReadme(story: UserStory, analysis: any): string {
    const template = this.templates.get('readme');
    if (!template) {
      return `# ${story.title}\n\n${story.description}`;
    }

    return template({ story, analysis });
  }

  private generateAPIDoc(story: UserStory, analysis: any): string {
    const template = this.templates.get('api-doc');
    if (!template) {
      return `# API Documentation: ${story.title}`;
    }

    return template({ story, analysis });
  }

  private async generateMigration(entities: any[], options: CodeGenerationOptions): Promise<GeneratedFile> {
    const template = this.templates.get('migration');
    if (!template) {
      throw new Error('Migration template not found');
    }

    const content = template({
      entities,
      timestamp: Date.now(),
      options
    });

    return {
      path: `migrations/${Date.now()}_create_${entities[0].name}_table.sql`,
      content,
      type: 'config'
    };
  }

  private async generateConfigs(story: UserStory, options: CodeGenerationOptions): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    // Environment configuration
    files.push({
      path: '.env.example',
      content: this.generateEnvConfig(story),
      type: 'config'
    });

    // Package.json updates
    if (options.language === 'typescript' || options.language === 'javascript') {
      files.push({
        path: 'package.json',
        content: this.generatePackageJsonUpdates(story),
        type: 'config'
      });
    }

    return files;
  }

  private async generateDockerFiles(story: UserStory, analysis: any): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    files.push({
      path: 'Dockerfile',
      content: this.generateDockerfile(story, analysis),
      type: 'config'
    });

    files.push({
      path: 'docker-compose.yml',
      content: this.generateDockerCompose(story, analysis),
      type: 'config'
    });

    return files;
  }

  private groupStoriesByFeature(stories: UserStory[]): Map<string, UserStory[]> {
    const grouped = new Map<string, UserStory[]>();

    for (const story of stories) {
      const feature = story.labels?.find(l => l.startsWith('feature:'))?.replace('feature:', '') || 'general';
      
      if (!grouped.has(feature)) {
        grouped.set(feature, []);
      }
      
      grouped.get(feature)!.push(story);
    }

    return grouped;
  }

  private async generateFeatureAPIDoc(feature: string, stories: UserStory[]): Promise<GeneratedFile> {
    const content = `# ${feature} API Documentation

## Overview
${stories[0].description}

## Endpoints
${stories.map(s => this.generateEndpointDoc(s)).join('\n\n')}
`;

    return {
      path: `docs/api/${this.slugify(feature)}.md`,
      content,
      type: 'doc'
    };
  }

  private generateEndpointDoc(story: UserStory): string {
    return `### ${story.title}

**Method:** POST
**Path:** /api/${this.slugify(story.title)}

**Request:**
\`\`\`json
{
  // Request body
}
\`\`\`

**Response:**
\`\`\`json
{
  // Response body
}
\`\`\`
`;
  }

  private async generateOpenAPISpec(stories: UserStory[]): Promise<string> {
    // Generate OpenAPI specification
    return `openapi: 3.0.0
info:
  title: API Documentation
  version: 1.0.0
paths:
  # Generated paths
`;
  }

  private async analyzeUserFlow(flow: string): Promise<any> {
    // Use Claude Flow to analyze user flow
    const command = `npx claude-flow@alpha sparc run architecture "Analyze user flow: ${flow}"`;
    
    try {
      const result = execSync(command, { encoding: 'utf-8' });
      return JSON.parse(result);
    } catch {
      return {
        steps: [],
        entities: [],
        actions: []
      };
    }
  }

  private async generateFromFlowAnalysis(analysis: any, options: CodeGenerationOptions): Promise<GeneratedCode> {
    // Generate code from flow analysis
    return {
      mainCode: [],
      testCode: [],
      documentation: [],
      scaffolding: []
    };
  }

  private renderTestTemplate(criterion: AcceptanceCriteria, options: CodeGenerationOptions): string {
    const template = this.templates.get(`test-${options.language}`);
    if (!template) {
      return '// Test template not found';
    }

    return template({ criterion, options });
  }

  private loadTemplates(): void {
    // Load Handlebars templates
    // This would load from template files in production
    this.templates.set('model-typescript', Handlebars.compile(`
/**
 * {{entity.name}} Model
 * Generated from user story
 */

export interface {{entity.name}} {
  id: string;
  {{#each entity.fields}}
  {{this.name}}: {{this.type}};
  {{/each}}
  createdAt: Date;
  updatedAt: Date;
}

export class {{entity.name}}Model {
  // Model implementation
}
`));

    // Add more templates...
  }

  private extractEntities(story: UserStory): any[] {
    // Extract entities from story text
    const entities: any[] = [];
    
    // Simple extraction logic - would be more sophisticated in production
    const words = story.description.split(' ');
    const nouns = words.filter(w => w[0] === w[0].toUpperCase() && w.length > 2);
    
    for (const noun of nouns) {
      entities.push({
        name: noun,
        fields: []
      });
    }

    return entities;
  }

  private extractActions(story: UserStory): any[] {
    // Extract actions from story
    const actions: any[] = [];
    
    // Extract from "I want" clause
    const verbs = story.iWant.match(/\b(create|update|delete|view|list|search)\b/gi) || [];
    
    for (const verb of verbs) {
      actions.push({
        name: verb.toLowerCase(),
        type: 'crud'
      });
    }

    return actions;
  }

  private extractValidations(story: UserStory): any[] {
    // Extract validation rules from acceptance criteria
    return story.acceptanceCriteria.map(ac => ({
      description: ac.description,
      type: 'business-rule'
    }));
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private generateEnvConfig(story: UserStory): string {
    return `# Environment configuration for ${story.title}
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/db
`;
  }

  private generatePackageJsonUpdates(story: UserStory): string {
    return JSON.stringify({
      scripts: {
        [`test:${this.slugify(story.title)}`]: `jest tests/${this.slugify(story.title)}`
      }
    }, null, 2);
  }

  private generateDockerfile(story: UserStory, analysis: any): string {
    return `FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
`;
  }

  private generateDockerCompose(story: UserStory, analysis: any): string {
    return `version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
`;
  }
}