/**
 * Funnel analysis implementation for Mixpanel
 */

import { AxiosInstance } from 'axios';
import { Logger } from '../core/logger';
import { MixpanelError } from './errors';

export interface FunnelAnalyzerOptions {
  httpClient: AxiosInstance;
  projectId: string;
  logger: Logger;
}

export interface FunnelDefinition {
  name: string;
  steps: string[];
  dateRange: {
    from: Date;
    to: Date;
  };
  unit?: 'minute' | 'hour' | 'day' | 'week' | 'month';
  where?: string;
  on?: string;
}

export interface FunnelResult {
  name: string;
  steps: FunnelStep[];
  overall: {
    conversionRate: number;
    avgTimeToConvert: number;
    totalConverted: number;
    totalEntered: number;
  };
  dateRange: {
    from: Date;
    to: Date;
  };
}

export interface FunnelStep {
  event: string;
  count: number;
  conversionRate: number;
  avgTimeFromPrevious?: number;
  dropoffRate: number;
}

export class FunnelAnalyzer {
  private readonly httpClient: AxiosInstance;
  private readonly projectId: string;
  private readonly logger: Logger;

  constructor(options: FunnelAnalyzerOptions) {
    this.httpClient = options.httpClient;
    this.projectId = options.projectId;
    this.logger = options.logger.child({ component: 'FunnelAnalyzer' });
  }

  /**
   * Analyze funnel conversion
   */
  async analyzeFunnel(definition: FunnelDefinition): Promise<FunnelResult> {
    try {
      this.logger.debug('Analyzing funnel', {
        name: definition.name,
        steps: definition.steps.length
      });

      // Build funnel query
      const params = {
        project_id: this.projectId,
        funnel_id: this.generateFunnelId(definition.name),
        from_date: this.formatDate(definition.dateRange.from),
        to_date: this.formatDate(definition.dateRange.to),
        funnel_window: 14, // days
        unit: definition.unit || 'day',
        events: JSON.stringify(definition.steps.map(event => ({
          event,
          selector: definition.on || null,
          filter: definition.where || null
        })))
      };

      // Call Mixpanel Funnels API
      const response = await this.httpClient.get('/2.0/funnels', { params });
      
      return this.transformFunnelResponse(definition, response.data);
    } catch (error) {
      this.logger.error('Failed to analyze funnel', error, {
        name: definition.name
      });
      throw new MixpanelError(`Funnel analysis failed: ${error.message}`);
    }
  }

  /**
   * List all funnels
   */
  async listFunnels(): Promise<any[]> {
    try {
      const response = await this.httpClient.get('/2.0/funnels/list', {
        params: { project_id: this.projectId }
      });
      
      return response.data;
    } catch (error) {
      this.logger.error('Failed to list funnels', error);
      throw new MixpanelError(`Failed to list funnels: ${error.message}`);
    }
  }

  /**
   * Transform Mixpanel funnel response
   */
  private transformFunnelResponse(
    definition: FunnelDefinition,
    data: any
  ): FunnelResult {
    const steps: FunnelStep[] = [];
    let previousCount = 0;

    // Process each step
    data.data.forEach((stepData: any, index: number) => {
      const count = stepData.count;
      const conversionRate = index === 0 ? 1 : count / data.data[0].count;
      const dropoffRate = index === 0 ? 0 : 1 - (count / previousCount);

      steps.push({
        event: definition.steps[index],
        count,
        conversionRate,
        dropoffRate,
        avgTimeFromPrevious: stepData.avg_time || undefined
      });

      previousCount = count;
    });

    // Calculate overall metrics
    const overall = {
      conversionRate: steps[steps.length - 1]?.conversionRate || 0,
      avgTimeToConvert: steps.reduce((sum, step) => sum + (step.avgTimeFromPrevious || 0), 0),
      totalConverted: steps[steps.length - 1]?.count || 0,
      totalEntered: steps[0]?.count || 0
    };

    return {
      name: definition.name,
      steps,
      overall,
      dateRange: definition.dateRange
    };
  }

  /**
   * Generate consistent funnel ID
   */
  private generateFunnelId(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  /**
   * Format date for Mixpanel API
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Create A/B test funnel comparison
   */
  async compareFunnels(
    baseDefinition: FunnelDefinition,
    variantProperty: string,
    variants: string[]
  ): Promise<Map<string, FunnelResult>> {
    const results = new Map<string, FunnelResult>();

    try {
      // Analyze funnel for each variant
      for (const variant of variants) {
        const variantDefinition = {
          ...baseDefinition,
          name: `${baseDefinition.name} - ${variant}`,
          where: baseDefinition.where
            ? `${baseDefinition.where} and properties["${variantProperty}"] == "${variant}"`
            : `properties["${variantProperty}"] == "${variant}"`
        };

        const result = await this.analyzeFunnel(variantDefinition);
        results.set(variant, result);
      }

      this.logger.info('Funnel comparison completed', {
        baseDefinition: baseDefinition.name,
        variants: variants.length
      });

      return results;
    } catch (error) {
      this.logger.error('Failed to compare funnels', error);
      throw new MixpanelError(`Funnel comparison failed: ${error.message}`);
    }
  }
}