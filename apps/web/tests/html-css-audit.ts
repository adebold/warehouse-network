import { test, expect, Page } from '@playwright/test';

interface AuditResult {
  page: string;
  issues: Array<{
    type: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    selector?: string;
  }>;
  metrics: {
    semanticScore: number;
    accessibilityScore: number;
    cssConsistencyScore: number;
    performanceScore: number;
  };
}

export class HTMLCSSAuditor {
  private results: AuditResult[] = [];

  async auditPage(page: Page, pageName: string): Promise<AuditResult> {
    const issues: AuditResult['issues'] = [];

    // Check semantic HTML structure
    const semanticIssues = await this.checkSemanticHTML(page);
    issues.push(...semanticIssues);

    // Check CSS consistency
    const cssIssues = await this.checkCSSConsistency(page);
    issues.push(...cssIssues);

    // Check responsive design
    const responsiveIssues = await this.checkResponsiveDesign(page);
    issues.push(...responsiveIssues);

    // Check component consistency
    const componentIssues = await this.checkComponentConsistency(page);
    issues.push(...componentIssues);

    // Calculate scores
    const metrics = this.calculateMetrics(issues);

    const result: AuditResult = {
      page: pageName,
      issues,
      metrics,
    };

    this.results.push(result);
    return result;
  }

  private async checkSemanticHTML(page: Page): Promise<AuditResult['issues']> {
    const issues: AuditResult['issues'] = [];

    // Check for proper heading hierarchy
    const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', elements =>
      elements.map(el => ({ tag: el.tagName, text: el.textContent }))
    );

    let lastLevel = 0;
    headings.forEach((heading, index) => {
      const level = parseInt(heading.tag.charAt(1));
      if (level - lastLevel > 1 && index > 0) {
        issues.push({
          type: 'semantic',
          severity: 'warning',
          message: `Skipped heading level: ${heading.tag} after H${lastLevel}`,
          selector: heading.tag,
        });
      }
      lastLevel = level;
    });

    // Check for multiple H1s
    const h1Count = await page.$$eval('h1', elements => elements.length);
    if (h1Count > 1) {
      issues.push({
        type: 'semantic',
        severity: 'warning',
        message: `Multiple H1 tags found (${h1Count}). Page should have only one H1.`,
        selector: 'h1',
      });
    }

    // Check for missing alt text
    const imagesWithoutAlt = await page.$$eval('img:not([alt])', elements => elements.length);
    if (imagesWithoutAlt > 0) {
      issues.push({
        type: 'accessibility',
        severity: 'error',
        message: `${imagesWithoutAlt} images without alt text found`,
        selector: 'img:not([alt])',
      });
    }

    // Check for form labels
    const inputsWithoutLabels = await page.$$eval(
      'input:not([type="hidden"]):not([type="submit"]):not([aria-label]):not([aria-labelledby])',
      elements => elements.filter(el => !el.closest('label')).length
    );

    if (inputsWithoutLabels > 0) {
      issues.push({
        type: 'accessibility',
        severity: 'error',
        message: `${inputsWithoutLabels} form inputs without associated labels`,
        selector: 'input',
      });
    }

    // Check for semantic HTML5 elements
    const semanticElements = ['nav', 'main', 'header', 'footer', 'article', 'section', 'aside'];
    for (const element of semanticElements) {
      const count = await page.$$eval(element, elements => elements.length);
      if (element === 'main' && count !== 1) {
        issues.push({
          type: 'semantic',
          severity: 'warning',
          message: `Page should have exactly one <main> element, found ${count}`,
          selector: 'main',
        });
      }
    }

    return issues;
  }

  private async checkCSSConsistency(page: Page): Promise<AuditResult['issues']> {
    const issues: AuditResult['issues'] = [];

    // Check for inline styles
    const elementsWithInlineStyles = await page.$$eval('[style]', elements =>
      elements.map(el => ({
        tag: el.tagName,
        style: el.getAttribute('style'),
        selector: el.className || el.id || el.tagName,
      }))
    );

    if (elementsWithInlineStyles.length > 0) {
      elementsWithInlineStyles.forEach(el => {
        issues.push({
          type: 'css',
          severity: 'warning',
          message: `Inline styles detected: ${el.style}`,
          selector: el.selector,
        });
      });
    }

    // Check for consistent button styling
    const buttons = await page.$$eval('button, .btn, [role="button"]', elements =>
      elements.map(el => ({
        classes: el.className,
        text: el.textContent,
        hasBaseClass: el.classList.contains('btn') || el.classList.contains('button'),
      }))
    );

    const buttonsWithoutBaseClass = buttons.filter(btn => !btn.hasBaseClass).length;
    if (buttonsWithoutBaseClass > 0) {
      issues.push({
        type: 'css',
        severity: 'warning',
        message: `${buttonsWithoutBaseClass} buttons without consistent base class`,
        selector: 'button',
      });
    }

    // Check for CSS custom properties usage
    const hasCustomProperties = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return Array.from(styles).some(prop => prop.startsWith('--'));
    });

    if (!hasCustomProperties) {
      issues.push({
        type: 'css',
        severity: 'info',
        message: 'No CSS custom properties found. Consider using them for theming.',
        selector: ':root',
      });
    }

    return issues;
  }

  private async checkResponsiveDesign(page: Page): Promise<AuditResult['issues']> {
    const issues: AuditResult['issues'] = [];
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1440, height: 900 },
    ];

    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      // Check for horizontal scroll
      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );

      if (hasHorizontalScroll) {
        issues.push({
          type: 'responsive',
          severity: 'error',
          message: `Horizontal scroll detected at ${viewport.name} viewport (${viewport.width}px)`,
          selector: 'body',
        });
      }

      // Check for overlapping elements
      const overlappingElements = await page.evaluate(() => {
        const elements = document.querySelectorAll('*');
        const overlapping: string[] = [];

        for (let i = 0; i < elements.length; i++) {
          const rect1 = elements[i].getBoundingClientRect();
          for (let j = i + 1; j < elements.length; j++) {
            const rect2 = elements[j].getBoundingClientRect();

            if (
              !(
                rect1.right < rect2.left ||
                rect1.left > rect2.right ||
                rect1.bottom < rect2.top ||
                rect1.top > rect2.bottom
              )
            ) {
              // Elements overlap
              const selector1 = (elements[i] as HTMLElement).className || elements[i].tagName;
              const selector2 = (elements[j] as HTMLElement).className || elements[j].tagName;
              overlapping.push(`${selector1} overlaps with ${selector2}`);
            }
          }
        }
        return overlapping.slice(0, 5); // Limit to 5 to avoid noise
      });

      if (overlappingElements.length > 0) {
        overlappingElements.forEach(overlap => {
          issues.push({
            type: 'responsive',
            severity: 'warning',
            message: `Element overlap at ${viewport.name}: ${overlap}`,
          });
        });
      }
    }

    // Reset to desktop viewport
    await page.setViewportSize({ width: 1440, height: 900 });

    return issues;
  }

  private async checkComponentConsistency(page: Page): Promise<AuditResult['issues']> {
    const issues: AuditResult['issues'] = [];

    // Check card components
    const cards = await page.$$eval('.card, [class*="card"]', elements =>
      elements.map(el => ({
        classes: el.className,
        hasHeader: !!el.querySelector('.card-header, [class*="card-header"]'),
        hasBody: !!el.querySelector('.card-body, .card-content, [class*="card-content"]'),
        hasFooter: !!el.querySelector('.card-footer, [class*="card-footer"]'),
      }))
    );

    const inconsistentCards = cards.filter(card => !card.hasBody).length;
    if (inconsistentCards > 0) {
      issues.push({
        type: 'component',
        severity: 'warning',
        message: `${inconsistentCards} card components without proper structure`,
        selector: '.card',
      });
    }

    // Check form consistency
    const forms = await page.$$eval('form', elements =>
      elements.map(el => ({
        hasSubmitButton: !!el.querySelector('button[type="submit"], input[type="submit"]'),
        hasLabels: el.querySelectorAll('label').length > 0,
        inputCount: el.querySelectorAll('input, select, textarea').length,
      }))
    );

    forms.forEach((form, index) => {
      if (form.inputCount > 0 && !form.hasSubmitButton) {
        issues.push({
          type: 'component',
          severity: 'warning',
          message: `Form ${index + 1} has inputs but no submit button`,
          selector: `form:nth-of-type(${index + 1})`,
        });
      }
    });

    // Check loading states
    const hasLoadingStates = await page.$$eval(
      '[class*="loading"], [class*="skeleton"], .spinner',
      elements => elements.length
    );

    if (hasLoadingStates === 0) {
      issues.push({
        type: 'component',
        severity: 'info',
        message: 'No loading states found. Consider adding loading indicators.',
      });
    }

    return issues;
  }

  private calculateMetrics(issues: AuditResult['issues']): AuditResult['metrics'] {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;

    const semanticScore = Math.max(0, 100 - issues.filter(i => i.type === 'semantic').length * 10);
    const accessibilityScore = Math.max(
      0,
      100 - issues.filter(i => i.type === 'accessibility').length * 15
    );
    const cssConsistencyScore = Math.max(0, 100 - issues.filter(i => i.type === 'css').length * 5);
    const performanceScore = Math.max(
      0,
      100 - issues.filter(i => i.type === 'responsive').length * 10
    );

    return {
      semanticScore,
      accessibilityScore,
      cssConsistencyScore,
      performanceScore,
    };
  }

  generateReport(): string {
    let report = '# HTML/CSS Audit Report\n\n';
    report += `Generated on: ${new Date().toLocaleString()}\n\n`;

    this.results.forEach(result => {
      report += `## ${result.page}\n\n`;
      report += '### Metrics\n';
      report += `- Semantic Score: ${result.metrics.semanticScore}/100\n`;
      report += `- Accessibility Score: ${result.metrics.accessibilityScore}/100\n`;
      report += `- CSS Consistency Score: ${result.metrics.cssConsistencyScore}/100\n`;
      report += `- Performance Score: ${result.metrics.performanceScore}/100\n\n`;

      if (result.issues.length > 0) {
        report += '### Issues Found\n\n';
        const groupedIssues = this.groupIssuesByType(result.issues);

        Object.entries(groupedIssues).forEach(([type, issues]) => {
          report += `#### ${type.charAt(0).toUpperCase() + type.slice(1)} Issues\n\n`;
          issues.forEach(issue => {
            const icon =
              issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
            report += `${icon} **${issue.severity.toUpperCase()}**: ${issue.message}\n`;
            if (issue.selector) {
              report += `   - Selector: \`${issue.selector}\`\n`;
            }
            report += '\n';
          });
        });
      } else {
        report += '✅ No issues found!\n\n';
      }
    });

    return report;
  }

  private groupIssuesByType(issues: AuditResult['issues']): Record<string, AuditResult['issues']> {
    return issues.reduce(
      (acc, issue) => {
        if (!acc[issue.type]) {acc[issue.type] = [];}
        acc[issue.type].push(issue);
        return acc;
      },
      {} as Record<string, AuditResult['issues']>
    );
  }
}

// Export test suite
test.describe('HTML/CSS Audit', () => {
  const auditor = new HTMLCSSAuditor();
  const pagesToAudit = [
    { path: '/', name: 'Homepage' },
    { path: '/search', name: 'Search Page' },
    { path: '/login', name: 'Login Page' },
    { path: '/register', name: 'Registration Page' },
    { path: '/app/dashboard', name: 'Dashboard' },
  ];

  pagesToAudit.forEach(({ path, name }) => {
    test(`Audit ${name}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');

      const result = await auditor.auditPage(page, name);

      // Assert minimum scores
      expect(result.metrics.semanticScore).toBeGreaterThanOrEqual(70);
      expect(result.metrics.accessibilityScore).toBeGreaterThanOrEqual(80);
      expect(result.metrics.cssConsistencyScore).toBeGreaterThanOrEqual(70);
      expect(result.metrics.performanceScore).toBeGreaterThanOrEqual(70);

      // Fail on critical errors
      const criticalErrors = result.issues.filter(i => i.severity === 'error');
      expect(criticalErrors).toHaveLength(0);
    });
  });

  test.afterAll(async () => {
    const report = auditor.generateReport();
    const fs = require('fs');
    fs.writeFileSync('audit-report.md', report);
    console.log('Audit report generated: audit-report.md');
  });
});
