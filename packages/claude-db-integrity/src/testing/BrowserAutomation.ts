import { EventEmitter } from 'events';

import type { 
  Persona, 
  TestScenario, 
  BrowserConfig, 
  AutomationResult,
  ScreenshotOptions 
} from '../types';
import { logger, loggers } from '../utils/logger';

export class BrowserAutomation extends EventEmitter {
  private browser: any;
  private config: BrowserConfig;
  private currentPage: any;

  constructor(config: BrowserConfig = {}) {
    super();
    this.config = {
      headless: process.env.NODE_ENV === 'production',
      timeout: 30000,
      slowMo: 0,
      viewport: { width: 1920, height: 1080 },
      ...config
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Browser Automation');
    
    try {
      const puppeteer = require('puppeteer');
      
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        slowMo: this.config.slowMo,
        defaultViewport: this.config.viewport,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--start-maximized'
        ]
      });
      
      logger.info('Browser automation initialized successfully');
      this.emit('browser:initialized');
    } catch (error) {
      logger.error('Failed to initialize browser automation:', error);
      throw error;
    }
  }

  /**
   * Execute a complete persona test scenario with browser automation
   */
  async executePersonaScenario(
    scenario: TestScenario, 
    persona: Persona, 
    baseUrl: string = 'http://localhost:3000'
  ): Promise<AutomationResult> {
    const timer = loggers.time('persona_scenario_execution', {
      scenario: scenario.name,
      persona: persona.name
    });
    
    logger.info(`Executing scenario "${scenario.name}" for persona "${persona.name}"`);
    
    try {
      this.currentPage = await this.browser.newPage();
      
      // Configure page for persona
      await this.configurePageForPersona(this.currentPage, persona);
      
      const startTime = Date.now();
      const stepResults: any[] = [];
      const screenshots: string[] = [];
      
      // Execute each step in the scenario
      for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i];
        
        try {
          const stepResult = await this.executeStep(step, baseUrl);
          stepResults.push({
            stepIndex: i,
            step: step!.action,
            status: 'passed',
            duration: stepResult.duration,
            screenshot: stepResult.screenshot
          });
          
          if (stepResult.screenshot) {
            screenshots.push(stepResult.screenshot);
          }
          
          // Emit progress event
          this.emit('step:completed', {
            scenario: scenario.name,
            step: step!.action,
            progress: ((i + 1) / scenario.steps.length) * 100
          });
          
        } catch (stepError) {
          logger.error(`Step failed: ${step!.action}`, stepError);
          
          // Take screenshot on failure
          const failureScreenshot = await this.takeScreenshot({
            prefix: 'failure',
            scenario: scenario.name,
            step: step!.action
          });
          
          stepResults.push({
            stepIndex: i,
            step: step!.action,
            status: 'failed',
            error: stepError instanceof Error ? stepError.message : String(stepError),
            screenshot: failureScreenshot
          });
          
          // Continue with next step or stop based on configuration
          if (!scenario.continueOnFailure) {
            break;
          }
        }
      }
      
      // Run assertions
      const assertionResults = await this.runAssertions(scenario.assertions || []);
      
      // Take final screenshot
      const finalScreenshot = await this.takeScreenshot({
        prefix: 'final',
        scenario: scenario.name
      });
      screenshots.push(finalScreenshot);
      
      const duration = timer.end();
      const passed = stepResults.every(r => r.status === 'passed') && 
                    assertionResults.every(r => r.passed);
      
      const result: AutomationResult = {
        id: `result_${Date.now()}`,
        scenarioId: scenario.id,
        personaId: persona.id,
        status: passed ? 'passed' : 'failed',
        startTime: new Date(startTime),
        endTime: new Date(),
        duration,
        steps: stepResults,
        assertions: assertionResults,
        screenshots,
        performance: {
          pageLoadTime: await this.measurePageLoadTime(),
          domContentLoaded: await this.measureDOMContentLoaded(),
          firstContentfulPaint: await this.measureFirstContentfulPaint(),
          largestContentfulPaint: await this.measureLargestContentfulPaint(),
          cumulativeLayoutShift: await this.measureCumulativeLayoutShift()
        },
        accessibility: await this.runAccessibilityChecks(persona),
        console: await this.getConsoleMessages(),
        network: await this.getNetworkActivity()
      };
      
      await this.currentPage.close();
      
      logger.info(`Scenario completed: ${scenario.name} - ${result.status}`);
      this.emit('scenario:completed', result);
      
      return result;
    } catch (error) {
      const duration = timer.end();
      
      logger.error(`Scenario execution failed: ${scenario.name}`, error);
      
      if (this.currentPage) {
        await this.currentPage.close();
      }
      
      return {
        id: `result_${Date.now()}`,
        scenarioId: scenario.id,
        personaId: persona.id,
        status: 'failed',
        startTime: new Date(),
        endTime: new Date(),
        duration,
        error: error instanceof Error ? error.message : String(error),
        steps: [],
        assertions: [],
        screenshots: [],
        performance: {},
        accessibility: {},
        console: [],
        network: []
      };
    }
  }

  /**
   * Configure page settings based on persona characteristics
   */
  private async configurePageForPersona(page: any, persona: Persona): Promise<void> {
    // Set viewport based on device profile
    if (persona.deviceProfile) {
      await page.setViewport({
        width: persona.deviceProfile.screenWidth || 1920,
        height: persona.deviceProfile.screenHeight || 1080,
        isMobile: persona.deviceProfile.mobile || false,
        hasTouch: persona.deviceProfile.mobile || false
      });
      
      if (persona.deviceProfile.userAgent) {
        await page.setUserAgent(persona.deviceProfile.userAgent);
      }
    }
    
    // Set accessibility preferences
    if (persona.accessibility) {
      const mediaFeatures = [];
      
      if (persona.accessibility.highContrast) {
        mediaFeatures.push({ name: 'prefers-contrast', value: 'high' });
      }
      
      if (persona.accessibility.reducedMotion) {
        mediaFeatures.push({ name: 'prefers-reduced-motion', value: 'reduce' });
      }
      
      if (persona.accessibility.darkMode) {
        mediaFeatures.push({ name: 'prefers-color-scheme', value: 'dark' });
      }
      
      if (mediaFeatures.length > 0) {
        await page.emulateMediaFeatures(mediaFeatures);
      }
      
      // Adjust font size if specified
      if (persona.accessibility.fontSize && persona.accessibility.fontSize !== 16) {
        await page.addStyleTag({
          content: `
            * { 
              font-size: ${persona.accessibility.fontSize}px !important; 
            }
            input, textarea, select {
              font-size: ${Math.max(16, persona.accessibility.fontSize)}px !important;
            }
          `
        });
      }
    }
    
    // Set language and locale
    if (persona.locale) {
      await page.setExtraHTTPHeaders({
        'Accept-Language': persona.locale
      });
    }
    
    // Set up session data and cookies
    if (persona.sessionData) {
      await page.evaluate((sessionData: any) => {
        for (const [key, value] of Object.entries(sessionData)) {
          localStorage.setItem(key, JSON.stringify(value));
        }
      }, persona.sessionData);
    }
    
    if (persona.cookies) {
      await page.setCookie(...persona.cookies);
    }
    
    // Set up network conditions based on persona (e.g., slow connection)
    if (persona.networkProfile) {
      await page.emulateNetworkConditions({
        offline: false,
        downloadThroughput: persona.networkProfile.downloadSpeed || 1000000,
        uploadThroughput: persona.networkProfile.uploadSpeed || 500000,
        latency: persona.networkProfile.latency || 20
      });
    }
    
    // Set up console message collection
    page.on('console', (msg: any) => {
      loggers.request.complete(page.url(), msg.type(), 0);
    });
    
    // Set up request/response monitoring
    page.on('request', (request: any) => {
      loggers.request.start(`request_${request.url()}`, request.url(), request.method());
    });
    
    page.on('response', (response: any) => {
      loggers.request.complete(`request_${response.url()}`, response.status(), 0);
    });
  }

  /**
   * Execute individual test step with proper error handling
   */
  private async executeStep(step: any, baseUrl: string): Promise<{ duration: number; screenshot?: string }> {
    const stepTimer = loggers.time('step_execution', {
      action: step.action,
      target: step.target
    });
    
    logger.debug(`Executing step: ${step.action} on ${step.target}`);
    
    try {
      switch (step.action) {
        case 'navigate':
          await this.navigate(step.target, baseUrl);
          break;
          
        case 'wait':
          await this.wait(step.timeout || 1000);
          break;
          
        case 'click':
          await this.click(step.target);
          break;
          
        case 'type':
        case 'fill':
          await this.type(step.target, step.data || step.value);
          break;
          
        case 'select':
          await this.select(step.target, step.value);
          break;
          
        case 'fill_form':
          await this.fillForm(step.data);
          break;
          
        case 'submit':
          await this.submit(step.target);
          break;
          
        case 'authenticate':
          await this.authenticate(step.credentials || step.data);
          break;
          
        case 'scroll':
          await this.scroll(step.target, step.direction);
          break;
          
        case 'hover':
          await this.hover(step.target);
          break;
          
        case 'drag_and_drop':
          await this.dragAndDrop(step.source, step.target);
          break;
          
        case 'upload_file':
          await this.uploadFile(step.target, step.filePath);
          break;
          
        case 'switch_tab':
          await this.switchTab(step.tabIndex);
          break;
          
        case 'handle_alert':
          await this.handleAlert(step.action);
          break;
          
        case 'wait_for_element':
          await this.waitForElement(step.target, step.timeout);
          break;
          
        case 'wait_for_text':
          await this.waitForText(step.target, step.text, step.timeout);
          break;
          
        case 'take_screenshot':
          return {
            duration: stepTimer.end(),
            screenshot: await this.takeScreenshot({
              prefix: 'step',
              name: step.name || step.action
            })
          };
          
        default:
          throw new Error(`Unknown step action: ${step.action}`);
      }
      
      // Take screenshot if requested
      let screenshot;
      if (step.screenshot) {
        screenshot = await this.takeScreenshot({
          prefix: 'step',
          name: step.action
        });
      }
      
      const result: any = {
        duration: stepTimer.end()
      };
      if (screenshot) {
        result.screenshot = screenshot;
      }
      return result;
    } catch (error) {
      stepTimer.end();
      throw new Error(`Step "${step.action}" failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Navigation methods
   */
  private async navigate(path: string, baseUrl: string): Promise<void> {
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
    
    await this.currentPage.goto(url, {
      waitUntil: 'networkidle0',
      timeout: this.config.timeout
    });
  }

  private async wait(ms: number): Promise<void> {
    await this.currentPage.waitForTimeout(ms);
  }

  /**
   * Interaction methods
   */
  private async click(selector: string): Promise<void> {
    await this.currentPage.waitForSelector(selector, { timeout: this.config.timeout });
    await this.currentPage.click(selector);
  }

  private async type(selector: string, text: string): Promise<void> {
    await this.currentPage.waitForSelector(selector, { timeout: this.config.timeout });
    await this.currentPage.focus(selector);
    await this.currentPage.keyboard.down('Control');
    await this.currentPage.keyboard.press('a');
    await this.currentPage.keyboard.up('Control');
    await this.currentPage.type(selector, text, { delay: 50 });
  }

  private async select(selector: string, value: string): Promise<void> {
    await this.currentPage.waitForSelector(selector, { timeout: this.config.timeout });
    await this.currentPage.select(selector, value);
  }

  private async fillForm(data: Record<string, any>): Promise<void> {
    for (const [field, value] of Object.entries(data)) {
      const selector = `[name="${field}"], [id="${field}"], [data-testid="${field}"]`;
      
      try {
        await this.currentPage.waitForSelector(selector, { timeout: 5000 });
        
        const elementType = await this.currentPage.evaluate((sel: any) => {
          const element = document.querySelector(sel);
          return element ? element.tagName.toLowerCase() : null;
        }, selector);
        
        if (elementType === 'select') {
          await this.select(selector, String(value));
        } else if (elementType === 'input' || elementType === 'textarea') {
          await this.type(selector, String(value));
        }
      } catch (error) {
        logger.warn(`Could not fill field ${field}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async submit(selector: string = '[type="submit"]'): Promise<void> {
    await this.currentPage.click(selector);
    
    // Wait for navigation or form submission response
    try {
      await Promise.race([
        this.currentPage.waitForNavigation({ timeout: 10000 }),
        this.currentPage.waitForSelector('.success, .error, [data-testid="form-result"]', { timeout: 10000 })
      ]);
    } catch (error) {
      // Form might submit without navigation or visible feedback
      logger.debug('No navigation or visible feedback after form submission');
    }
  }

  private async authenticate(credentials: { email?: string; username?: string; password: string }): Promise<void> {
    const emailField = '[name="email"], [name="username"], [type="email"]';
    const passwordField = '[name="password"], [type="password"]';
    const submitButton = '[type="submit"], button[type="submit"], .login-submit';
    
    const loginId = credentials.email || credentials.username;
    if (loginId) {
      await this.type(emailField, loginId);
    }
    
    await this.type(passwordField, credentials.password);
    await this.click(submitButton);
    
    // Wait for authentication to complete
    await Promise.race([
      this.currentPage.waitForNavigation({ timeout: 15000 }),
      this.currentPage.waitForSelector('.dashboard, [data-testid="authenticated"]', { timeout: 15000 })
    ]);
  }

  private async scroll(selector: string, direction: 'up' | 'down' | 'top' | 'bottom' = 'down'): Promise<void> {
    if (selector) {
      await this.currentPage.waitForSelector(selector);
      await this.currentPage.evaluate((sel: any) => {
        document.querySelector(sel)?.scrollIntoView();
      }, selector);
    } else {
      const scrollDistance = direction === 'down' || direction === 'bottom' ? 500 : -500;
      await this.currentPage.evaluate((distance: any) => {
        window.scrollBy(0, distance);
      }, scrollDistance);
    }
  }

  private async hover(selector: string): Promise<void> {
    await this.currentPage.waitForSelector(selector);
    await this.currentPage.hover(selector);
  }

  private async dragAndDrop(sourceSelector: string, targetSelector: string): Promise<void> {
    await this.currentPage.waitForSelector(sourceSelector);
    await this.currentPage.waitForSelector(targetSelector);
    
    const source = await this.currentPage.$(sourceSelector);
    const target = await this.currentPage.$(targetSelector);
    
    if (source && target) {
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();
      
      if (sourceBox && targetBox) {
        await this.currentPage.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
        await this.currentPage.mouse.down();
        await this.currentPage.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2);
        await this.currentPage.mouse.up();
      }
    }
  }

  private async uploadFile(selector: string, filePath: string): Promise<void> {
    const inputElement = await this.currentPage.$(selector);
    if (inputElement) {
      await inputElement.uploadFile(filePath);
    }
  }

  private async switchTab(tabIndex: number): Promise<void> {
    const pages = await this.browser.pages();
    if (pages[tabIndex]) {
      this.currentPage = pages[tabIndex];
      await this.currentPage.bringToFront();
    }
  }

  private async handleAlert(action: 'accept' | 'dismiss' | 'getText'): Promise<string | void> {
    return new Promise((resolve, reject) => {
      this.currentPage.once('dialog', async (dialog: any) => {
        try {
          if (action === 'getText') {
            const text = dialog.message();
            await dialog.accept();
            resolve(text);
          } else if (action === 'accept') {
            await dialog.accept();
            resolve();
          } else {
            await dialog.dismiss();
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  private async waitForElement(selector: string, timeout?: number): Promise<void> {
    await this.currentPage.waitForSelector(selector, {
      timeout: timeout || this.config.timeout
    });
  }

  private async waitForText(selector: string, text: string, timeout?: number): Promise<void> {
    await this.currentPage.waitForFunction(
      (sel: any, txt: any) => {
        const element = document.querySelector(sel);
        return element && element.textContent?.includes(txt);
      },
      { timeout: timeout || this.config.timeout },
      selector,
      text
    );
  }

  /**
   * Assertion methods
   */
  private async runAssertions(assertions: any[]): Promise<any[]> {
    const results = [];
    
    for (const assertion of assertions) {
      try {
        const result = await this.runAssertion(assertion);
        results.push(result);
      } catch (error) {
        results.push({
          type: assertion.type,
          passed: false,
          error: error instanceof Error ? error.message : String(error),
          message: assertion.message
        });
      }
    }
    
    return results;
  }

  private async runAssertion(assertion: any): Promise<{ type: string; passed: boolean; message?: string; details?: any }> {
    switch (assertion.type) {
      case 'element_exists':
        const element = await this.currentPage.$(assertion.selector);
        return {
          type: assertion.type,
          passed: !!element,
          message: assertion.message
        };
        
      case 'element_visible':
        const isVisible = await this.currentPage.evaluate((selector: any) => {
          const elem = document.querySelector(selector);
          if (!elem) {return false;}
          const style = window.getComputedStyle(elem);
          return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }, assertion.selector);
        return {
          type: assertion.type,
          passed: isVisible,
          message: assertion.message
        };
        
      case 'text_contains':
        const text = await this.currentPage.textContent(assertion.selector);
        const contains = text?.includes(assertion.expected);
        return {
          type: assertion.type,
          passed: !!contains,
          message: assertion.message,
          details: { actualText: text, expectedText: assertion.expected }
        };
        
      case 'url_matches':
        const url = this.currentPage.url();
        const matches = new RegExp(assertion.pattern).test(url);
        return {
          type: assertion.type,
          passed: matches,
          message: assertion.message,
          details: { actualUrl: url, pattern: assertion.pattern }
        };
        
      case 'attribute_equals':
        const attrValue = await this.currentPage.getAttribute(assertion.selector, assertion.attribute);
        const equals = attrValue === assertion.expected;
        return {
          type: assertion.type,
          passed: equals,
          message: assertion.message,
          details: { actualValue: attrValue, expectedValue: assertion.expected }
        };
        
      default:
        return {
          type: assertion.type,
          passed: false,
          message: `Unknown assertion type: ${assertion.type}`
        };
    }
  }

  /**
   * Performance measurement methods
   */
  private async measurePageLoadTime(): Promise<number> {
    const metrics = await this.currentPage.metrics();
    return metrics.DomContentLoaded || 0;
  }

  private async measureDOMContentLoaded(): Promise<number> {
    const performanceMetrics = await this.currentPage.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      if (nav) {
        return nav.domContentLoadedEventEnd - nav.startTime;
      }
      return 0;
    });
    return performanceMetrics;
  }

  private async measureFirstContentfulPaint(): Promise<number> {
    const metrics = await this.currentPage.metrics();
    return metrics.FirstMeaningfulPaint || 0;
  }

  private async measureLargestContentfulPaint(): Promise<number> {
    return await this.currentPage.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          resolve(lastEntry?.startTime || 0);
        }).observe({ entryTypes: ['largest-contentful-paint'] });
        
        // Fallback timeout
        setTimeout(() => resolve(0), 5000);
      });
    });
  }

  private async measureCumulativeLayoutShift(): Promise<number> {
    return await this.currentPage.evaluate(() => {
      return new Promise((resolve) => {
        let clsValue = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as any[]) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
          resolve(clsValue);
        }).observe({ entryTypes: ['layout-shift'] });
        
        // Fallback timeout
        setTimeout(() => resolve(clsValue), 5000);
      });
    });
  }

  /**
   * Accessibility checking
   */
  private async runAccessibilityChecks(persona: Persona): Promise<any> {
    const axeCore = require('axe-core');
    
    const results = await this.currentPage.evaluate(axeCore.run);
    
    // Filter results based on persona accessibility needs
    const filteredResults = {
      ...results,
      violations: results.violations.filter((violation: any) => {
        // Filter based on persona's accessibility requirements
        if (persona.accessibility?.screenReader && violation.tags.includes('screen-reader')) {
          return true;
        }
        if (persona.accessibility?.keyboardOnly && violation.tags.includes('keyboard')) {
          return true;
        }
        return violation.impact === 'critical' || violation.impact === 'serious';
      })
    };
    
    return filteredResults;
  }

  /**
   * Utility methods
   */
  private async takeScreenshot(options: ScreenshotOptions = {}): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${options.prefix || 'screenshot'}-${timestamp}.png`;
    const path = `./screenshots/${filename}`;
    
    // Ensure screenshots directory exists
    const fs = require('fs');
    if (!fs.existsSync('./screenshots')) {
      fs.mkdirSync('./screenshots', { recursive: true });
    }
    
    await this.currentPage.screenshot({
      path,
      fullPage: options.fullPage !== false,
      type: 'png'
    });
    
    return path;
  }

  private async getConsoleMessages(): Promise<any[]> {
    // Console messages are collected via page event listeners
    // This would return the collected messages
    return [];
  }

  private async getNetworkActivity(): Promise<any[]> {
    // Network activity is collected via page event listeners
    // This would return the collected network requests/responses
    return [];
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Browser Automation');
    
    if (this.currentPage) {
      await this.currentPage.close();
    }
    
    if (this.browser) {
      await this.browser.close();
    }
    
    this.removeAllListeners();
  }
}