/**
 * Cohort management and analysis for Mixpanel
 */

import { AxiosInstance } from 'axios';
import { Logger } from '../core/logger';
import { MixpanelError } from './errors';

export interface CohortManagerOptions {
  httpClient: AxiosInstance;
  projectId: string;
  logger: Logger;
}

export interface CohortDefinition {
  name: string;
  description: string;
  filter: {
    event?: string;
    properties?: Record<string, any>;
    dateRange?: {
      from: Date;
      to: Date;
    };
    operator?: 'and' | 'or';
  };
}

export interface CohortAnalysis {
  cohortId: string;
  name: string;
  size: number;
  retention: RetentionData[];
  metrics: Record<string, any>;
  lastUpdated: Date;
}

export interface RetentionData {
  period: string;
  users: number;
  percentage: number;
}

export class CohortManager {
  private readonly httpClient: AxiosInstance;
  private readonly projectId: string;
  private readonly logger: Logger;

  constructor(options: CohortManagerOptions) {
    this.httpClient = options.httpClient;
    this.projectId = options.projectId;
    this.logger = options.logger.child({ component: 'CohortManager' });
  }

  /**
   * Create a new cohort
   */
  async createCohort(definition: CohortDefinition): Promise<string> {
    try {
      this.logger.debug('Creating cohort', {
        name: definition.name
      });

      const cohortFilter = this.buildCohortFilter(definition.filter);

      const response = await this.httpClient.post('/2.0/cohorts/create', {
        project_id: this.projectId,
        name: definition.name,
        description: definition.description,
        data: cohortFilter
      });

      const cohortId = response.data.id;
      
      this.logger.info('Cohort created', {
        cohortId,
        name: definition.name
      });

      return cohortId;
    } catch (error) {
      this.logger.error('Failed to create cohort', error, {
        name: definition.name
      });
      throw new MixpanelError(`Failed to create cohort: ${error.message}`);
    }
  }

  /**
   * Get cohort details
   */
  async getCohort(cohortId: string): Promise<any> {
    try {
      const response = await this.httpClient.get(`/2.0/cohorts/${cohortId}`, {
        params: { project_id: this.projectId }
      });
      
      return response.data;
    } catch (error) {
      this.logger.error('Failed to get cohort', error, {
        cohortId
      });
      throw new MixpanelError(`Failed to get cohort: ${error.message}`);
    }
  }

  /**
   * List all cohorts
   */
  async listCohorts(): Promise<any[]> {
    try {
      const response = await this.httpClient.get('/2.0/cohorts/list', {
        params: { project_id: this.projectId }
      });
      
      return response.data;
    } catch (error) {
      this.logger.error('Failed to list cohorts', error);
      throw new MixpanelError(`Failed to list cohorts: ${error.message}`);
    }
  }

  /**
   * Analyze cohort metrics
   */
  async analyzeCohort(
    cohortId: string,
    metric: string,
    dateRange: { from: Date; to: Date }
  ): Promise<CohortAnalysis> {
    try {
      this.logger.debug('Analyzing cohort', {
        cohortId,
        metric
      });

      // Get cohort details
      const cohort = await this.getCohort(cohortId);

      // Get retention data
      const retentionResponse = await this.httpClient.get('/2.0/retention', {
        params: {
          project_id: this.projectId,
          retention_type: 'compounded',
          born_event: '$cohort_created',
          event: metric,
          cohort_id: cohortId,
          from_date: this.formatDate(dateRange.from),
          to_date: this.formatDate(dateRange.to),
          interval: 7,
          interval_type: 'day'
        }
      });

      // Get cohort metrics
      const metricsResponse = await this.httpClient.get('/2.0/segmentation', {
        params: {
          project_id: this.projectId,
          event: metric,
          from_date: this.formatDate(dateRange.from),
          to_date: this.formatDate(dateRange.to),
          where: `properties["$cohort_ids"] == ${cohortId}`,
          unit: 'day'
        }
      });

      return {
        cohortId,
        name: cohort.name,
        size: cohort.count,
        retention: this.transformRetentionData(retentionResponse.data),
        metrics: metricsResponse.data.data,
        lastUpdated: new Date()
      };
    } catch (error) {
      this.logger.error('Failed to analyze cohort', error, {
        cohortId
      });
      throw new MixpanelError(`Failed to analyze cohort: ${error.message}`);
    }
  }

  /**
   * Update cohort definition
   */
  async updateCohort(
    cohortId: string,
    updates: Partial<CohortDefinition>
  ): Promise<void> {
    try {
      const data: any = {
        project_id: this.projectId
      };

      if (updates.name) {
        data.name = updates.name;
      }

      if (updates.description) {
        data.description = updates.description;
      }

      if (updates.filter) {
        data.data = this.buildCohortFilter(updates.filter);
      }

      await this.httpClient.post(`/2.0/cohorts/${cohortId}`, data);
      
      this.logger.info('Cohort updated', { cohortId });
    } catch (error) {
      this.logger.error('Failed to update cohort', error, {
        cohortId
      });
      throw new MixpanelError(`Failed to update cohort: ${error.message}`);
    }
  }

  /**
   * Delete cohort
   */
  async deleteCohort(cohortId: string): Promise<void> {
    try {
      await this.httpClient.delete(`/2.0/cohorts/${cohortId}`, {
        params: { project_id: this.projectId }
      });
      
      this.logger.info('Cohort deleted', { cohortId });
    } catch (error) {
      this.logger.error('Failed to delete cohort', error, {
        cohortId
      });
      throw new MixpanelError(`Failed to delete cohort: ${error.message}`);
    }
  }

  /**
   * Build cohort filter from definition
   */
  private buildCohortFilter(filter: CohortDefinition['filter']): any {
    const conditions: any[] = [];

    // Event condition
    if (filter.event) {
      conditions.push({
        filter_type: 'event',
        event: filter.event,
        ...(filter.dateRange && {
          from_date: this.formatDate(filter.dateRange.from),
          to_date: this.formatDate(filter.dateRange.to)
        })
      });
    }

    // Property conditions
    if (filter.properties) {
      for (const [key, value] of Object.entries(filter.properties)) {
        conditions.push({
          filter_type: 'property',
          property_name: key,
          property_value: value,
          operator: '=='
        });
      }
    }

    return {
      filter: {
        operator: filter.operator || 'and',
        filters: conditions
      }
    };
  }

  /**
   * Transform retention API response
   */
  private transformRetentionData(data: any): RetentionData[] {
    const retention: RetentionData[] = [];

    Object.entries(data.data).forEach(([period, metrics]: [string, any]) => {
      retention.push({
        period,
        users: metrics.cohort_size,
        percentage: metrics.values ? metrics.values[0] : 0
      });
    });

    return retention.sort((a, b) => 
      parseInt(a.period) - parseInt(b.period)
    );
  }

  /**
   * Format date for Mixpanel API
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}