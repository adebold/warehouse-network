import axios from 'axios';
import { logger } from '../utils/logger';
import { config } from '../config';
import { Database } from '../database';
import { KubernetesService } from './kubernetes';

export interface MonitoringStack {
  prometheus: PrometheusConfig;
  grafana: GrafanaConfig;
  alertmanager: AlertManagerConfig;
  loki?: LokiConfig;
  jaeger?: JaegerConfig;
}

export interface PrometheusConfig {
  url: string;
  retention: string;
  scrapeInterval: string;
  evaluationInterval: string;
  targets: PrometheusTarget[];
  rules: PrometheusRule[];
}

export interface PrometheusTarget {
  job: string;
  targets: string[];
  labels?: { [key: string]: string };
}

export interface PrometheusRule {
  name: string;
  interval: string;
  rules: AlertRule[];
}

export interface AlertRule {
  alert: string;
  expr: string;
  for?: string;
  labels: { [key: string]: string };
  annotations: { [key: string]: string };
}

export interface GrafanaConfig {
  url: string;
  apiKey: string;
  datasources: GrafanaDatasource[];
  dashboards: GrafanaDashboard[];
}

export interface GrafanaDatasource {
  name: string;
  type: string;
  url: string;
  access?: string;
  isDefault?: boolean;
}

export interface GrafanaDashboard {
  title: string;
  uid: string;
  tags: string[];
  json: any;
}

export interface AlertManagerConfig {
  url: string;
  routes: AlertRoute[];
  receivers: AlertReceiver[];
  inhibitRules: InhibitRule[];
}

export interface AlertRoute {
  match: { [key: string]: string };
  receiver: string;
  groupBy?: string[];
  groupWait?: string;
  groupInterval?: string;
  repeatInterval?: string;
}

export interface AlertReceiver {
  name: string;
  slackConfigs?: SlackConfig[];
  emailConfigs?: EmailConfig[];
  webhookConfigs?: WebhookConfig[];
  pagerdutyConfigs?: PagerDutyConfig[];
}

export interface SlackConfig {
  channel: string;
  apiUrl: string;
  title?: string;
  text?: string;
}

export interface EmailConfig {
  to: string;
  from: string;
  smarthost: string;
  authUsername?: string;
  authPassword?: string;
}

export interface WebhookConfig {
  url: string;
  httpConfig?: any;
}

export interface PagerDutyConfig {
  routingKey: string;
  description: string;
  client?: string;
  clientUrl?: string;
}

export interface InhibitRule {
  sourceMatch: { [key: string]: string };
  targetMatch: { [key: string]: string };
  equal: string[];
}

export interface LokiConfig {
  url: string;
  labels: { [key: string]: string };
}

export interface JaegerConfig {
  url: string;
  serviceName: string;
  samplingRate: number;
}

export interface MetricQuery {
  query: string;
  start?: Date;
  end?: Date;
  step?: string;
}

export interface Alert {
  name: string;
  state: 'pending' | 'firing' | 'resolved';
  labels: { [key: string]: string };
  annotations: { [key: string]: string };
  activeAt: Date;
  value: number;
}

export interface ApplicationMetrics {
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIn: number;
  networkOut: number;
  requestRate: number;
  errorRate: number;
  responseTime: number;
  throughput: number;
  activeConnections: number;
  podCount?: number;
  readyPods?: number;
}

export class MonitoringService {
  private static instance: MonitoringService;
  private prometheusClient: any;
  private grafanaClient: any;

  private constructor() {
    this.initializeClients();
  }

  public static async initialize(): Promise<MonitoringService> {
    if (!MonitoringService.instance) {
      MonitoringService.instance = new MonitoringService();
      await MonitoringService.instance.testConnections();
    }
    return MonitoringService.instance;
  }

  public static getInstance(): MonitoringService {
    if (!MonitoringService.instance) {
      throw new Error('MonitoringService not initialized. Call initialize() first.');
    }
    return MonitoringService.instance;
  }

  private initializeClients(): void {
    // Initialize Prometheus client
    this.prometheusClient = axios.create({
      baseURL: config.monitoring?.prometheusUrl || 'http://localhost:9090',
      timeout: 30000,
    });

    // Initialize Grafana client
    this.grafanaClient = axios.create({
      baseURL: config.monitoring?.grafanaUrl || 'http://localhost:3000',
      headers: {
        'Authorization': `Bearer ${config.monitoring?.grafanaApiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  private async testConnections(): Promise<void> {
    try {
      // Test Prometheus connection
      await this.prometheusClient.get('/api/v1/query', {
        params: { query: 'up' },
      });
      logger.info('Successfully connected to Prometheus');

      // Test Grafana connection
      await this.grafanaClient.get('/api/health');
      logger.info('Successfully connected to Grafana');
    } catch (error) {
      logger.error('Failed to connect to monitoring services:', error instanceof Error ? error : new Error(String(error)));
      // Don't throw - monitoring should be optional
    }
  }

  // Stack deployment
  public async deployMonitoringStack(stack: MonitoringStack): Promise<void> {
    try {
      logger.info('Deploying monitoring stack');

      // Deploy Prometheus
      await this.deployPrometheus(stack.prometheus);

      // Deploy Grafana
      await this.deployGrafana(stack.grafana);

      // Deploy AlertManager
      await this.deployAlertManager(stack.alertmanager);

      // Deploy Loki if configured
      if (stack.loki) {
        await this.deployLoki(stack.loki);
      }

      // Deploy Jaeger if configured
      if (stack.jaeger) {
        await this.deployJaeger(stack.jaeger);
      }

      logger.info('Monitoring stack deployed successfully');
    } catch (error) {
      logger.error('Failed to deploy monitoring stack:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async deployPrometheus(config: PrometheusConfig): Promise<void> {
    const k8sService = KubernetesService.getInstance();

    // Create ConfigMap with Prometheus configuration
    const prometheusConfig = {
      'prometheus.yml': this.generatePrometheusConfig(config),
    };

    await k8sService.createConfigMap(
      'prometheus-config',
      'monitoring',
      prometheusConfig
    );

    // Deploy Prometheus
    await k8sService.createDeployment({
      name: 'prometheus',
      namespace: 'monitoring',
      image: 'prom/prometheus:latest',
      replicas: 1,
      ports: [{ name: 'web', port: 9090, targetPort: 9090 }],
      env: [
        { name: 'PROMETHEUS_RETENTION_TIME', value: config.retention },
      ],
      resources: {
        requests: { cpu: '500m', memory: '512Mi' },
        limits: { cpu: '1000m', memory: '1Gi' },
      },
    });

    // Create service
    await k8sService.createService({
      name: 'prometheus',
      namespace: 'monitoring',
      selector: { app: 'prometheus' },
      ports: [{ name: 'web', port: 9090, targetPort: 9090 }],
      type: 'ClusterIP',
    });
  }

  private async deployGrafana(config: GrafanaConfig): Promise<void> {
    const k8sService = KubernetesService.getInstance();

    // Create secret for Grafana admin password
    await k8sService.createSecret(
      'grafana-admin',
      'monitoring',
      {
        'admin-user': 'admin',
        'admin-password': process.env.GRAFANA_ADMIN_PASSWORD || 'admin',
      }
    );

    // Deploy Grafana
    await k8sService.createDeployment({
      name: 'grafana',
      namespace: 'monitoring',
      image: 'grafana/grafana:latest',
      replicas: 1,
      ports: [{ name: 'http', port: 3000, targetPort: 3000 }],
      env: [
        { name: 'GF_SECURITY_ADMIN_USER', value: 'admin' },
        { name: 'GF_SECURITY_ADMIN_PASSWORD', value: process.env.GRAFANA_ADMIN_PASSWORD || 'admin' },
        { name: 'GF_INSTALL_PLUGINS', value: 'grafana-piechart-panel,grafana-clock-panel' },
      ],
      resources: {
        requests: { cpu: '250m', memory: '256Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      },
    });

    // Create service
    await k8sService.createService({
      name: 'grafana',
      namespace: 'monitoring',
      selector: { app: 'grafana' },
      ports: [{ name: 'http', port: 3000, targetPort: 3000 }],
      type: 'ClusterIP',
    });

    // Configure datasources and dashboards
    await this.configureGrafana(config);
  }

  private async deployAlertManager(config: AlertManagerConfig): Promise<void> {
    const k8sService = KubernetesService.getInstance();

    // Create ConfigMap with AlertManager configuration
    const alertmanagerConfig = {
      'alertmanager.yml': this.generateAlertManagerConfig(config),
    };

    await k8sService.createConfigMap(
      'alertmanager-config',
      'monitoring',
      alertmanagerConfig
    );

    // Deploy AlertManager
    await k8sService.createDeployment({
      name: 'alertmanager',
      namespace: 'monitoring',
      image: 'prom/alertmanager:latest',
      replicas: 1,
      ports: [{ name: 'web', port: 9093, targetPort: 9093 }],
      resources: {
        requests: { cpu: '100m', memory: '128Mi' },
        limits: { cpu: '200m', memory: '256Mi' },
      },
    });

    // Create service
    await k8sService.createService({
      name: 'alertmanager',
      namespace: 'monitoring',
      selector: { app: 'alertmanager' },
      ports: [{ name: 'web', port: 9093, targetPort: 9093 }],
      type: 'ClusterIP',
    });
  }

  private async deployLoki(config: LokiConfig): Promise<void> {
    const k8sService = KubernetesService.getInstance();

    // Deploy Loki for log aggregation
    await k8sService.createDeployment({
      name: 'loki',
      namespace: 'monitoring',
      image: 'grafana/loki:latest',
      replicas: 1,
      ports: [{ name: 'http', port: 3100, targetPort: 3100 }],
      resources: {
        requests: { cpu: '250m', memory: '256Mi' },
        limits: { cpu: '500m', memory: '512Mi' },
      },
    });

    // Create service
    await k8sService.createService({
      name: 'loki',
      namespace: 'monitoring',
      selector: { app: 'loki' },
      ports: [{ name: 'http', port: 3100, targetPort: 3100 }],
      type: 'ClusterIP',
    });
  }

  private async deployJaeger(config: JaegerConfig): Promise<void> {
    const k8sService = KubernetesService.getInstance();

    // Deploy Jaeger for distributed tracing
    await k8sService.createDeployment({
      name: 'jaeger',
      namespace: 'monitoring',
      image: 'jaegertracing/all-in-one:latest',
      replicas: 1,
      ports: [
        { name: 'query', port: 16686, targetPort: 16686 },
        { name: 'collector', port: 14268, targetPort: 14268 },
      ],
      env: [
        { name: 'COLLECTOR_ZIPKIN_HTTP_PORT', value: '9411' },
      ],
      resources: {
        requests: { cpu: '250m', memory: '512Mi' },
        limits: { cpu: '500m', memory: '1Gi' },
      },
    });

    // Create service
    await k8sService.createService({
      name: 'jaeger',
      namespace: 'monitoring',
      selector: { app: 'jaeger' },
      ports: [
        { name: 'query', port: 16686, targetPort: 16686 },
        { name: 'collector', port: 14268, targetPort: 14268 },
      ],
      type: 'ClusterIP',
    });
  }

  // Metric queries
  public async queryMetrics(query: MetricQuery): Promise<any> {
    try {
      const params: any = {
        query: query.query,
      };

      if (query.start && query.end) {
        params.start = Math.floor(query.start.getTime() / 1000);
        params.end = Math.floor(query.end.getTime() / 1000);
        params.step = query.step || '15s';

        const response = await this.prometheusClient.get('/api/v1/query_range', { params });
        return response.data.data.result;
      } else {
        const response = await this.prometheusClient.get('/api/v1/query', { params });
        return response.data.data.result;
      }
    } catch (error) {
      logger.error('Failed to query metrics:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getApplicationMetrics(
    application: string,
    environment: string
  ): Promise<ApplicationMetrics> {
    const queries = {
      cpuUsage: `avg(rate(container_cpu_usage_seconds_total{pod=~"${application}.*",namespace="${environment}"}[5m])) * 100`,
      memoryUsage: `avg(container_memory_usage_bytes{pod=~"${application}.*",namespace="${environment}"}) / 1024 / 1024`,
      diskUsage: `avg(container_fs_usage_bytes{pod=~"${application}.*",namespace="${environment}"}) / 1024 / 1024 / 1024`,
      networkIn: `sum(rate(container_network_receive_bytes_total{pod=~"${application}.*",namespace="${environment}"}[5m]))`,
      networkOut: `sum(rate(container_network_transmit_bytes_total{pod=~"${application}.*",namespace="${environment}"}[5m]))`,
      requestRate: `sum(rate(http_requests_total{job="${application}",namespace="${environment}"}[5m]))`,
      errorRate: `sum(rate(http_requests_total{job="${application}",namespace="${environment}",status=~"5.."}[5m])) / sum(rate(http_requests_total{job="${application}",namespace="${environment}"}[5m]))`,
      responseTime: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="${application}",namespace="${environment}"}[5m])) * 1000`,
      throughput: `sum(rate(http_request_size_bytes_sum{job="${application}",namespace="${environment}"}[5m]))`,
      activeConnections: `sum(http_connections_active{job="${application}",namespace="${environment}"})`,
      podCount: `count(up{job="${application}",namespace="${environment}"})`,
      readyPods: `count(up{job="${application}",namespace="${environment}"} == 1)`,
    };

    const metrics: ApplicationMetrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      networkIn: 0,
      networkOut: 0,
      requestRate: 0,
      errorRate: 0,
      responseTime: 0,
      throughput: 0,
      activeConnections: 0,
      podCount: 0,
      readyPods: 0,
    };

    // Execute all queries in parallel
    const results = await Promise.all(
      Object.entries(queries).map(async ([key, query]) => {
        try {
          const result = await this.queryMetrics({ query });
          return { key, value: result[0]?.value[1] || 0 };
        } catch (error) {
          logger.warn(`Failed to query ${key}:`, error instanceof Error ? error : new Error(String(error)));
          return { key, value: 0 };
        }
      })
    );

    // Map results to metrics object
    results.forEach(({ key, value }) => {
      (metrics as any)[key] = parseFloat(value);
    });

    return metrics;
  }

  // Alert management
  public async getAlerts(filters?: {
    state?: 'pending' | 'firing';
    labels?: { [key: string]: string };
  }): Promise<Alert[]> {
    try {
      const response = await this.prometheusClient.get('/api/v1/alerts');
      let alerts: Alert[] = response.data.data.alerts.map((alert: any) => ({
        name: alert.labels.alertname,
        state: alert.state,
        labels: alert.labels,
        annotations: alert.annotations,
        activeAt: new Date(alert.activeAt),
        value: parseFloat(alert.value),
      }));

      // Apply filters
      if (filters?.state) {
        alerts = alerts.filter(alert => alert.state === filters.state);
      }

      if (filters?.labels) {
        alerts = alerts.filter(alert => {
          return Object.entries(filters.labels!).every(
            ([key, value]) => alert.labels[key] === value
          );
        });
      }

      return alerts;
    } catch (error) {
      logger.error('Failed to get alerts:', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  public async createAlertRule(rule: AlertRule): Promise<void> {
    try {
      // Add rule to Prometheus configuration
      // This would require updating the ConfigMap and reloading Prometheus
      
      await Database.query(
        `INSERT INTO alert_rules (name, expression, duration, labels, annotations, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [rule.alert, rule.expr, rule.for || '5m', JSON.stringify(rule.labels), JSON.stringify(rule.annotations)]
      );

      logger.info('Created alert rule', { rule: rule.alert });
    } catch (error) {
      logger.error('Failed to create alert rule:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Dashboard management
  public async createDashboard(dashboard: GrafanaDashboard): Promise<string> {
    try {
      const response = await this.grafanaClient.post('/api/dashboards/db', {
        dashboard: dashboard.json,
        folderId: 0,
        overwrite: false,
      });

      logger.info('Created Grafana dashboard', { title: dashboard.title });
      return response.data.uid;
    } catch (error) {
      logger.error('Failed to create dashboard:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getDashboard(uid: string): Promise<any> {
    try {
      const response = await this.grafanaClient.get(`/api/dashboards/uid/${uid}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get dashboard:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async listDashboards(): Promise<any[]> {
    try {
      const response = await this.grafanaClient.get('/api/search');
      return response.data;
    } catch (error) {
      logger.error('Failed to list dashboards:', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  // SLO management
  public async calculateSLO(
    objective: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{ availability: number; errorBudget: number }> {
    const query = {
      query: objective,
      start: timeRange.start,
      end: timeRange.end,
      step: '1m',
    };

    const results = await this.queryMetrics(query);
    
    // Calculate availability percentage
    const totalMinutes = (timeRange.end.getTime() - timeRange.start.getTime()) / 60000;
    const availableMinutes = results.reduce((sum: number, result: any) => {
      return sum + (parseFloat(result.value[1]) === 1 ? 1 : 0);
    }, 0);

    const availability = (availableMinutes / totalMinutes) * 100;
    const errorBudget = 100 - availability;

    return { availability, errorBudget };
  }

  // Helper methods
  private generatePrometheusConfig(config: PrometheusConfig): string {
    const yaml = `
global:
  scrape_interval: ${config.scrapeInterval}
  evaluation_interval: ${config.evaluationInterval}

rule_files:
${config.rules.map(rule => `  - '/etc/prometheus/rules/${rule.name}.yml'`).join('\n')}

scrape_configs:
${config.targets.map(target => `
  - job_name: '${target.job}'
    static_configs:
      - targets: ${JSON.stringify(target.targets)}
        labels:
${Object.entries(target.labels || {}).map(([k, v]) => `          ${k}: '${v}'`).join('\n')}
`).join('')}
`;
    return yaml;
  }

  private generateAlertManagerConfig(config: AlertManagerConfig): string {
    const yaml = `
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'default'
  routes:
${config.routes.map(route => `
    - match:
${Object.entries(route.match).map(([k, v]) => `        ${k}: '${v}'`).join('\n')}
      receiver: ${route.receiver}
`).join('')}

receivers:
${config.receivers.map(receiver => `
  - name: '${receiver.name}'
${receiver.slackConfigs?.map(slack => `
    slack_configs:
      - channel: '${slack.channel}'
        api_url: '${slack.apiUrl}'
`).join('') || ''}
${receiver.emailConfigs?.map(email => `
    email_configs:
      - to: '${email.to}'
        from: '${email.from}'
        smarthost: '${email.smarthost}'
`).join('') || ''}
`).join('')}

inhibit_rules:
${config.inhibitRules.map(rule => `
  - source_match:
${Object.entries(rule.sourceMatch).map(([k, v]) => `      ${k}: '${v}'`).join('\n')}
    target_match:
${Object.entries(rule.targetMatch).map(([k, v]) => `      ${k}: '${v}'`).join('\n')}
    equal: ${JSON.stringify(rule.equal)}
`).join('')}
`;
    return yaml;
  }

  private async configureGrafana(config: GrafanaConfig): Promise<void> {
    // Add datasources
    for (const datasource of config.datasources) {
      try {
        await this.grafanaClient.post('/api/datasources', datasource);
        logger.info('Added Grafana datasource', { name: datasource.name });
      } catch (error) {
        logger.warn('Failed to add datasource:', error instanceof Error ? error : new Error(String(error)));
      }
    }

    // Import dashboards
    for (const dashboard of config.dashboards) {
      try {
        await this.createDashboard(dashboard);
      } catch (error) {
        logger.warn('Failed to import dashboard:', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  // Export monitoring configuration
  public async exportMonitoringConfig(): Promise<MonitoringStack> {
    const prometheusTargets = await this.getPrometheusTargets();
    const grafanaDashboards = await this.listDashboards();
    const alertRules = await this.getAlertRules();

    return {
      prometheus: {
        url: config.monitoring?.prometheusUrl || 'http://localhost:9090',
        retention: '15d',
        scrapeInterval: '15s',
        evaluationInterval: '15s',
        targets: prometheusTargets,
        rules: alertRules,
      },
      grafana: {
        url: config.monitoring?.grafanaUrl || 'http://localhost:3000',
        apiKey: config.monitoring?.grafanaApiKey || '',
        datasources: [],
        dashboards: grafanaDashboards,
      },
      alertmanager: {
        url: config.monitoring?.alertmanagerUrl || 'http://localhost:9093',
        routes: [],
        receivers: [],
        inhibitRules: [],
      },
    };
  }

  private async getPrometheusTargets(): Promise<PrometheusTarget[]> {
    try {
      const response = await this.prometheusClient.get('/api/v1/targets');
      return response.data.data.activeTargets.map((target: any) => ({
        job: target.labels.job,
        targets: [target.labels.instance],
        labels: target.labels,
      }));
    } catch (error) {
      logger.error('Failed to get Prometheus targets:', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  private async getAlertRules(): Promise<PrometheusRule[]> {
    const result = await Database.query('SELECT * FROM alert_rules');
    
    return [{
      name: 'custom-alerts',
      interval: '30s',
      rules: result.rows.map(row => ({
        alert: row.name,
        expr: row.expression,
        for: row.duration,
        labels: row.labels,
        annotations: row.annotations,
      })),
    }];
  }
}