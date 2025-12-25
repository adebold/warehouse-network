import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { ClaudeMemoryManager } from '../memory/ClaudeMemoryManager';
import type { 
  Persona, 
  UserJourney, 
  PersonaTestSuite, 
  TestScenario,
  PersonaValidationResult,
  PersonaConfig
} from '../types';

export class PersonaManager extends EventEmitter {
  private memoryManager: ClaudeMemoryManager;
  private personas: Map<string, Persona> = new Map();
  private journeys: Map<string, UserJourney> = new Map();
  private activeTests: Map<string, PersonaTestSuite> = new Map();

  constructor(config: PersonaConfig, memoryManager: ClaudeMemoryManager) {
    super();
    this.memoryManager = memoryManager;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Persona Manager');
    
    try {
      // Load personas from memory or create defaults
      await this.loadPersonas();
      
      // Load existing user journeys
      await this.loadUserJourneys();
      
      // Register default personas
      await this.registerDefaultPersonas();
      
      logger.info(`Persona Manager initialized with ${this.personas.size} personas and ${this.journeys.size} journeys`);
    } catch (error) {
      logger.error('Failed to initialize Persona Manager:', error);
      throw error;
    }
  }

  /**
   * Register a new persona with characteristics and permissions
   */
  async registerPersona(persona: Persona): Promise<void> {
    this.personas.set(persona.id, persona);
    
    // Store in Claude memory for cross-session persistence
    await this.memoryManager.store(`personas/${persona.id}`, persona, {
      namespace: 'persona-testing',
      tags: ['persona', persona.role, persona.department],
      ttl: 86400 * 7 // 7 days
    });
    
    logger.info(`Registered persona: ${persona.name} (${persona.role})`);
    this.emit('persona:registered', persona);
  }

  /**
   * Create a user journey with multiple test scenarios
   */
  async createUserJourney(journey: UserJourney): Promise<void> {
    this.journeys.set(journey.id, journey);
    
    // Validate journey scenarios against personas
    for (const scenario of journey.scenarios) {
      await this.validateScenarioForPersona(scenario, journey.personaId);
    }
    
    // Store journey in memory
    await this.memoryManager.store(`journeys/${journey.id}`, journey, {
      namespace: 'persona-testing',
      tags: ['journey', journey.personaId, journey.epic],
      ttl: 86400 * 30 // 30 days
    });
    
    logger.info(`Created user journey: ${journey.name} for persona ${journey.personaId}`);
    this.emit('journey:created', journey);
  }

  /**
   * Execute persona-based functional tests
   */
  async runPersonaTests(options: {
    personaId?: string;
    journeyId?: string;
    epic?: string;
    environment?: 'development' | 'staging' | 'production';
  } = {}): Promise<PersonaValidationResult> {
    const startTime = Date.now();
    const testSuiteId = `test_${Date.now()}`;
    
    logger.info(`Starting persona-based tests (Suite: ${testSuiteId})`);
    
    try {
      const testsToRun = await this.selectTestsToRun(options);
      const results: PersonaValidationResult[] = [];
      
      for (const test of testsToRun) {
        const result = await this.executePersonaTest(test, options.environment);
        results.push(result);
        
        // Store individual test result
        await this.memoryManager.store(`test-results/${result.id}`, result, {
          namespace: 'persona-testing',
          tags: ['test-result', test.personaId, test.epic]
        });
      }
      
      const summary: PersonaValidationResult = {
        id: testSuiteId,
        personaId: options.personaId || 'multiple',
        journeyId: options.journeyId || 'multiple',
        epic: options.epic || 'multiple',
        environment: options.environment || 'development',
        status: results.every(r => r.status === 'passed') ? 'passed' : 'failed',
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
        scenarios: results.flatMap(r => r.scenarios || []),
        summary: {
          total: results.length,
          passed: results.filter(r => r.status === 'passed').length,
          failed: results.filter(r => r.status === 'failed').length,
          skipped: results.filter(r => r.status === 'skipped').length,
          coverage: this.calculateCoverage(results)
        },
        violations: results.flatMap(r => r.violations || []),
        performance: {
          avgResponseTime: this.calculateAvgResponseTime(results),
          slowestScenario: this.findSlowestScenario(results),
          fastestScenario: this.findFastestScenario(results)
        }
      };
      
      // Store complete test suite result
      await this.memoryManager.store(`test-suites/${testSuiteId}`, summary, {
        namespace: 'persona-testing',
        tags: ['test-suite', 'summary']
      });
      
      logger.info(`Persona tests completed: ${summary.summary.passed}/${summary.summary.total} passed`);
      this.emit('tests:complete', summary);
      
      return summary;
    } catch (error) {
      logger.error('Persona tests failed:', error);
      throw error;
    }
  }

  /**
   * Generate persona-based test scenarios from user stories
   */
  async generateTestsFromStories(stories: string[], epic: string): Promise<UserJourney[]> {
    const journeys: UserJourney[] = [];
    
    for (const story of stories) {
      const scenarios = await this.parseStoryIntoScenarios(story);
      
      // Create journeys for relevant personas
      const relevantPersonas = await this.findRelevantPersonas(story);
      
      for (const persona of relevantPersonas) {
        const journey: UserJourney = {
          id: `journey_${Date.now()}_${persona.id}`,
          name: `${story.substring(0, 50)}... (${persona.name})`,
          description: `Auto-generated journey from user story for ${persona.name}`,
          personaId: persona.id,
          epic,
          scenarios,
          tags: ['auto-generated', 'story-based'],
          priority: 'medium',
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await this.createUserJourney(journey);
        journeys.push(journey);
      }
    }
    
    return journeys;
  }

  /**
   * Validate form interactions for specific persona
   */
  async validateFormInteraction(personaId: string, formPath: string, testData: any): Promise<PersonaValidationResult> {
    const persona = this.personas.get(personaId);
    if (!persona) {
      throw new Error(`Persona not found: ${personaId}`);
    }
    
    logger.info(`Validating form interaction: ${formPath} for persona ${persona.name}`);
    
    // Create test scenario for form interaction
    const scenario: TestScenario = {
      id: `form_test_${Date.now()}`,
      name: `Form Validation: ${formPath}`,
      description: `Validate form interaction for ${persona.name}`,
      steps: [
        {
          action: 'navigate',
          target: formPath,
          expected: 'Page loads successfully'
        },
        {
          action: 'authenticate',
          target: 'login',
          data: persona.credentials,
          expected: 'Authentication successful'
        },
        {
          action: 'fill_form',
          target: 'form',
          data: this.adaptTestDataForPersona(testData, persona),
          expected: 'Form accepts valid data'
        },
        {
          action: 'submit',
          target: 'submit_button',
          expected: 'Form submits successfully'
        },
        {
          action: 'verify_result',
          target: 'success_message',
          expected: 'Success confirmation displayed'
        }
      ],
      assertions: [
        {
          type: 'element_exists',
          selector: '[data-testid="success-message"]',
          message: 'Success message should be displayed'
        },
        {
          type: 'database_integrity',
          query: 'SELECT COUNT(*) FROM form_submissions WHERE user_id = ?',
          params: [persona.userId],
          expected: 'at_least_one',
          message: 'Form submission should be saved to database'
        }
      ],
      timeout: 30000
    };
    
    return await this.executeScenario(scenario, persona);
  }

  /**
   * Execute browser automation for persona testing
   */
  private async executePersonaTest(test: PersonaTestSuite, environment?: string): Promise<PersonaValidationResult> {
    const persona = this.personas.get(test.personaId);
    if (!persona) {
      throw new Error(`Persona not found: ${test.personaId}`);
    }
    
    const startTime = Date.now();
    const results: any[] = [];
    const violations: any[] = [];
    
    try {
      // Initialize browser automation
      const browser = await this.initializeBrowser(persona, environment);
      
      for (const scenario of test.scenarios) {
        try {
          const scenarioResult = await this.executeScenario(scenario, persona, browser);
          results.push(scenarioResult);
          
          if (scenarioResult.status === 'failed') {
            violations.push(...scenarioResult.violations || []);
          }
        } catch (error) {
          logger.error(`Scenario failed: ${scenario.name}`, error);
          results.push({
            id: scenario.id,
            status: 'failed',
            error: error.message,
            violations: [{
              type: 'execution_error',
              severity: 'error',
              message: error.message,
              scenario: scenario.name
            }]
          });
        }
      }
      
      await browser.close();
      
      return {
        id: `result_${Date.now()}`,
        personaId: test.personaId,
        journeyId: test.id,
        epic: test.epic || 'unknown',
        environment: environment || 'development',
        status: violations.length === 0 ? 'passed' : 'failed',
        startTime: new Date(startTime),
        endTime: new Date(),
        duration: Date.now() - startTime,
        scenarios: results,
        violations,
        summary: {
          total: results.length,
          passed: results.filter(r => r.status === 'passed').length,
          failed: results.filter(r => r.status === 'failed').length,
          skipped: results.filter(r => r.status === 'skipped').length,
          coverage: 0 // Will be calculated separately
        }
      };
    } catch (error) {
      logger.error(`Persona test failed for ${persona.name}:`, error);
      throw error;
    }
  }

  private async executeScenario(scenario: TestScenario, persona: Persona, browser?: any): Promise<any> {
    logger.debug(`Executing scenario: ${scenario.name} for persona ${persona.name}`);
    
    const startTime = Date.now();
    const violations: any[] = [];
    
    try {
      // If no browser provided, create one for this scenario
      if (!browser) {
        browser = await this.initializeBrowser(persona);
      }
      
      const page = await browser.newPage();
      
      // Set persona context (viewport, user agent, etc.)
      await this.setPersonaContext(page, persona);
      
      // Execute scenario steps
      for (const step of scenario.steps) {
        await this.executeStep(step, page, persona);
      }
      
      // Run assertions
      for (const assertion of scenario.assertions || []) {
        const assertionResult = await this.runAssertion(assertion, page);
        if (!assertionResult.passed) {
          violations.push({
            type: 'assertion_failed',
            severity: 'error',
            message: assertion.message || 'Assertion failed',
            details: assertionResult.details,
            scenario: scenario.name,
            step: assertion.type
          });
        }
      }
      
      await page.close();
      
      return {
        id: scenario.id,
        name: scenario.name,
        status: violations.length === 0 ? 'passed' : 'failed',
        duration: Date.now() - startTime,
        violations
      };
    } catch (error) {
      return {
        id: scenario.id,
        name: scenario.name,
        status: 'failed',
        duration: Date.now() - startTime,
        error: error.message,
        violations: [{
          type: 'execution_error',
          severity: 'error',
          message: error.message,
          scenario: scenario.name
        }]
      };
    }
  }

  private async initializeBrowser(persona: Persona, environment?: string) {
    const puppeteer = require('puppeteer');
    
    const browserOptions: any = {
      headless: process.env.NODE_ENV === 'production',
      defaultViewport: {
        width: persona.deviceProfile?.screenWidth || 1920,
        height: persona.deviceProfile?.screenHeight || 1080
      },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    };
    
    // Add persona-specific browser settings
    if (persona.deviceProfile?.mobile) {
      browserOptions.args.push('--user-agent=' + persona.deviceProfile.userAgent);
    }
    
    if (persona.accessibility?.screenReader) {
      browserOptions.args.push('--enable-accessibility');
    }
    
    return await puppeteer.launch(browserOptions);
  }

  private async setPersonaContext(page: any, persona: Persona): Promise<void> {
    // Set viewport for device profile
    if (persona.deviceProfile) {
      await page.setViewport({
        width: persona.deviceProfile.screenWidth || 1920,
        height: persona.deviceProfile.screenHeight || 1080,
        isMobile: persona.deviceProfile.mobile || false
      });
    }
    
    // Set user agent
    if (persona.deviceProfile?.userAgent) {
      await page.setUserAgent(persona.deviceProfile.userAgent);
    }
    
    // Set accessibility preferences
    if (persona.accessibility) {
      if (persona.accessibility.highContrast) {
        await page.emulateMediaFeatures([{ name: 'prefers-contrast', value: 'high' }]);
      }
      
      if (persona.accessibility.reducedMotion) {
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      }
      
      if (persona.accessibility.fontSize) {
        await page.addStyleTag({
          content: `* { font-size: ${persona.accessibility.fontSize}px !important; }`
        });
      }
    }
    
    // Set language preferences
    if (persona.locale) {
      await page.setExtraHTTPHeaders({
        'Accept-Language': persona.locale
      });
    }
    
    // Set session data
    if (persona.sessionData) {
      for (const [key, value] of Object.entries(persona.sessionData)) {
        await page.evaluate((k, v) => {
          localStorage.setItem(k, JSON.stringify(v));
        }, key, value);
      }
    }
  }

  private async executeStep(step: any, page: any, persona: Persona): Promise<void> {
    logger.debug(`Executing step: ${step.action} on ${step.target}`);
    
    switch (step.action) {
      case 'navigate':
        await page.goto(step.target, { waitUntil: 'networkidle0' });
        break;
        
      case 'click':
        await page.click(step.target);
        break;
        
      case 'fill_form':
        for (const [field, value] of Object.entries(step.data || {})) {
          await page.fill(`[name="${field}"]`, String(value));
        }
        break;
        
      case 'type':
        await page.type(step.target, step.data);
        break;
        
      case 'wait':
        await page.waitForTimeout(step.timeout || 1000);
        break;
        
      case 'wait_for_element':
        await page.waitForSelector(step.target, { timeout: step.timeout || 5000 });
        break;
        
      case 'authenticate':
        if (persona.credentials) {
          await page.fill('[name="email"]', persona.credentials.email);
          await page.fill('[name="password"]', persona.credentials.password);
          await page.click('[type="submit"]');
          await page.waitForNavigation();
        }
        break;
        
      case 'submit':
        await page.click(step.target);
        break;
        
      default:
        logger.warn(`Unknown step action: ${step.action}`);
    }
  }

  private async runAssertion(assertion: any, page: any): Promise<{ passed: boolean; details?: any }> {
    try {
      switch (assertion.type) {
        case 'element_exists':
          const element = await page.$(assertion.selector);
          return { passed: !!element };
          
        case 'text_contains':
          const text = await page.textContent(assertion.selector);
          return { 
            passed: text?.includes(assertion.expected),
            details: { actualText: text, expectedText: assertion.expected }
          };
          
        case 'url_matches':
          const url = page.url();
          return { 
            passed: new RegExp(assertion.pattern).test(url),
            details: { actualUrl: url, pattern: assertion.pattern }
          };
          
        case 'database_integrity':
          // This would integrate with the main integrity engine
          return { passed: true }; // Placeholder
          
        default:
          return { passed: false, details: { error: `Unknown assertion type: ${assertion.type}` } };
      }
    } catch (error) {
      return { 
        passed: false, 
        details: { error: error.message } 
      };
    }
  }

  private async registerDefaultPersonas(): Promise<void> {
    const defaultPersonas: Persona[] = [
      {
        id: 'admin',
        name: 'System Administrator',
        role: 'admin',
        department: 'IT',
        permissions: ['read', 'write', 'delete', 'admin'],
        characteristics: {
          experienceLevel: 'expert',
          techSavvy: true,
          primaryGoals: ['system management', 'user support', 'security'],
          painPoints: ['complex workflows', 'performance issues']
        },
        credentials: {
          email: 'admin@test.com',
          password: 'admin123',
          userId: 'admin-001'
        },
        deviceProfile: {
          screenWidth: 1920,
          screenHeight: 1080,
          mobile: false,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        locale: 'en-US'
      },
      {
        id: 'end_user',
        name: 'End User',
        role: 'user',
        department: 'General',
        permissions: ['read'],
        characteristics: {
          experienceLevel: 'beginner',
          techSavvy: false,
          primaryGoals: ['complete tasks quickly', 'find information'],
          painPoints: ['complex interfaces', 'unclear instructions']
        },
        credentials: {
          email: 'user@test.com',
          password: 'user123',
          userId: 'user-001'
        },
        deviceProfile: {
          screenWidth: 375,
          screenHeight: 812,
          mobile: true,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15'
        },
        accessibility: {
          screenReader: false,
          highContrast: false,
          reducedMotion: false,
          fontSize: 16
        },
        locale: 'en-US'
      },
      {
        id: 'manager',
        name: 'Department Manager',
        role: 'manager',
        department: 'Business',
        permissions: ['read', 'write'],
        characteristics: {
          experienceLevel: 'intermediate',
          techSavvy: true,
          primaryGoals: ['team oversight', 'reporting', 'decision making'],
          painPoints: ['slow reports', 'data accuracy']
        },
        credentials: {
          email: 'manager@test.com',
          password: 'manager123',
          userId: 'manager-001'
        },
        deviceProfile: {
          screenWidth: 1366,
          screenHeight: 768,
          mobile: false,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        locale: 'en-US'
      }
    ];
    
    for (const persona of defaultPersonas) {
      await this.registerPersona(persona);
    }
  }

  private async loadPersonas(): Promise<void> {
    try {
      const personaEntries = await this.memoryManager.search('personas/', {
        namespace: 'persona-testing'
      });
      
      for (const entry of personaEntries) {
        this.personas.set(entry.value.id, entry.value);
      }
    } catch (error) {
      logger.debug('No existing personas found in memory');
    }
  }

  private async loadUserJourneys(): Promise<void> {
    try {
      const journeyEntries = await this.memoryManager.search('journeys/', {
        namespace: 'persona-testing'
      });
      
      for (const entry of journeyEntries) {
        this.journeys.set(entry.value.id, entry.value);
      }
    } catch (error) {
      logger.debug('No existing user journeys found in memory');
    }
  }

  private async selectTestsToRun(options: any): Promise<PersonaTestSuite[]> {
    const tests: PersonaTestSuite[] = [];
    
    // Filter journeys based on criteria
    for (const [journeyId, journey] of this.journeys) {
      if (options.personaId && journey.personaId !== options.personaId) continue;
      if (options.journeyId && journey.id !== options.journeyId) continue;
      if (options.epic && journey.epic !== options.epic) continue;
      
      const testSuite: PersonaTestSuite = {
        id: journey.id,
        personaId: journey.personaId,
        name: journey.name,
        scenarios: journey.scenarios,
        epic: journey.epic
      };
      
      tests.push(testSuite);
    }
    
    return tests;
  }

  private calculateCoverage(results: PersonaValidationResult[]): number {
    // Calculate test coverage based on completed scenarios vs total possible
    const totalScenarios = results.reduce((sum, r) => sum + (r.summary?.total || 0), 0);
    const passedScenarios = results.reduce((sum, r) => sum + (r.summary?.passed || 0), 0);
    
    return totalScenarios > 0 ? Math.round((passedScenarios / totalScenarios) * 100) : 0;
  }

  private calculateAvgResponseTime(results: PersonaValidationResult[]): number {
    const durations = results.map(r => r.duration).filter(d => d > 0);
    return durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
  }

  private findSlowestScenario(results: PersonaValidationResult[]): any {
    return results.reduce((slowest, current) => 
      current.duration > (slowest?.duration || 0) ? current : slowest, null);
  }

  private findFastestScenario(results: PersonaValidationResult[]): any {
    return results.reduce((fastest, current) => 
      current.duration < (fastest?.duration || Infinity) ? current : fastest, null);
  }

  private async validateScenarioForPersona(scenario: TestScenario, personaId: string): Promise<void> {
    const persona = this.personas.get(personaId);
    if (!persona) {
      throw new Error(`Persona not found for scenario validation: ${personaId}`);
    }
    
    // Validate that persona has required permissions for scenario actions
    // This is a placeholder for more complex validation logic
  }

  private adaptTestDataForPersona(testData: any, persona: Persona): any {
    // Adapt test data based on persona characteristics
    const adaptedData = { ...testData };
    
    // Add persona-specific fields
    if (persona.userId) {
      adaptedData.userId = persona.userId;
    }
    
    if (persona.department) {
      adaptedData.department = persona.department;
    }
    
    // Adjust data based on experience level
    if (persona.characteristics?.experienceLevel === 'beginner') {
      // Provide more detailed/guided data for beginners
      adaptedData.helpText = true;
      adaptedData.validation = 'strict';
    }
    
    return adaptedData;
  }

  private async parseStoryIntoScenarios(story: string): Promise<TestScenario[]> {
    // Parse user story into executable test scenarios
    // This would use NLP or pattern matching to extract scenarios
    return [{
      id: `scenario_${Date.now()}`,
      name: `Auto-generated from: ${story.substring(0, 30)}...`,
      description: story,
      steps: [],
      assertions: [],
      timeout: 30000
    }];
  }

  private async findRelevantPersonas(story: string): Promise<Persona[]> {
    // Analyze story to determine which personas are relevant
    // This would use keyword matching or ML to identify relevant personas
    return Array.from(this.personas.values()).slice(0, 2); // Placeholder
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Persona Manager');
    this.removeAllListeners();
  }
}