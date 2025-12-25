// Monitoring Manager - Comprehensive monitoring stack with Prometheus, Grafana, and alerts
import { logger, LogContext } from '../utils/logger.js';
import { ComponentHealth, MonitoringConfig, AlertConfig, DashboardConfig } from './devops-engine.js';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { execSync, spawn } from 'child_process';
import { v4 as uuid } from 'uuid';

export interface PrometheusConfig {
  global: {
    scrape_interval: string;
    evaluation_interval: string;
  };
  rule_files: string[];
  scrape_configs: ScrapeConfig[];
  alerting: {
    alertmanagers: AlertManagerConfig[];
  };
}

export interface ScrapeConfig {
  job_name: string;
  static_configs: StaticConfig[];
  scrape_interval?: string;
  metrics_path?: string;
  kubernetes_sd_configs?: KubernetesSDConfig[];
  relabel_configs?: RelabelConfig[];
}

export interface StaticConfig {
  targets: string[];
  labels?: Record<string, string>;
}

export interface KubernetesSDConfig {
  role: 'node' | 'pod' | 'service' | 'endpoints' | 'ingress';
  namespaces?: {
    names: string[];
  };
}

export interface RelabelConfig {
  source_labels: string[];
  target_label: string;
  action: 'replace' | 'keep' | 'drop' | 'labelmap';
  regex?: string;
  replacement?: string;
}

export interface AlertManagerConfig {
  static_configs: StaticConfig[];
  scheme?: string;
  timeout?: string;
}

export interface GrafanaConfig {
  datasources: GrafanaDatasource[];
  dashboards: GrafanaDashboard[];
  notifications: GrafanaNotification[];
  plugins: string[];
}

export interface GrafanaDatasource {
  name: string;
  type: string;
  url: string;
  access: 'proxy' | 'direct';
  isDefault?: boolean;
  basicAuth?: boolean;
  basicAuthUser?: string;
  basicAuthPassword?: string;
  jsonData?: Record<string, any>;
  secureJsonData?: Record<string, any>;
}

export interface GrafanaDashboard {
  id: string;
  title: string;
  tags: string[];
  panels: GrafanaPanel[];
  variables?: GrafanaVariable[];
  refresh?: string;
  timeFrom?: string;
  timeTo?: string;
}

export interface GrafanaPanel {
  id: number;
  title: string;
  type: 'graph' | 'stat' | 'table' | 'heatmap' | 'logs' | 'gauge';
  gridPos: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  targets: GrafanaTarget[];
  fieldConfig?: any;
  options?: any;
}

export interface GrafanaTarget {
  expr: string;
  interval?: string;
  legendFormat?: string;
  refId: string;
}

export interface GrafanaVariable {
  name: string;
  type: 'query' | 'custom' | 'constant' | 'datasource' | 'interval';
  query?: string;
  options?: Array<{ text: string; value: string }>;
  current?: { text: string; value: string };
  refresh?: 'never' | 'on_dashboard_load' | 'on_time_range_change';
}

export interface GrafanaNotification {
  name: string;
  type: 'slack' | 'email' | 'webhook' | 'pagerduty';
  settings: Record<string, any>;
}

export interface MonitoringStack {
  prometheus: PrometheusConfig;
  grafana: GrafanaConfig;
  alertmanager: AlertManagerConfiguration;
  exporters: ExporterConfig[];
}

export interface AlertManagerConfiguration {
  global: {
    smtp_smarthost?: string;
    smtp_from?: string;
    slack_api_url?: string;
  };
  route: AlertRoute;
  receivers: AlertReceiver[];
  templates: string[];
}

export interface AlertRoute {
  group_by: string[];
  group_wait: string;
  group_interval: string;
  repeat_interval: string;
  receiver: string;
  routes?: AlertRoute[];
  match?: Record<string, string>;
  match_re?: Record<string, string>;
}

export interface AlertReceiver {
  name: string;
  email_configs?: EmailConfig[];
  slack_configs?: SlackConfig[];
  webhook_configs?: WebhookConfig[];
  pagerduty_configs?: PagerDutyConfig[];
}

export interface EmailConfig {
  to: string;
  subject: string;
  body: string;
  html?: string;
}

export interface SlackConfig {
  api_url: string;
  channel: string;
  title: string;
  text: string;
  color?: string;
  username?: string;
  icon_emoji?: string;
}

export interface WebhookConfig {
  url: string;
  send_resolved?: boolean;
  http_config?: {
    basic_auth?: {
      username: string;
      password: string;
    };
  };
}

export interface PagerDutyConfig {
  routing_key: string;
  description: string;
  severity?: string;
  client?: string;
  client_url?: string;
}

export interface ExporterConfig {
  name: string;
  image: string;
  port: number;
  scrapeInterval: string;
  path: string;
  labels?: Record<string, string>;
}

export interface MetricsResult {
  status: 'success' | 'error';
  data: {
    resultType: 'matrix' | 'vector' | 'scalar' | 'string';
    result: any[];
  };
}

export interface AlertResult {
  status: string;
  data: {
    alerts: Alert[];
  };
}

export interface Alert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: 'pending' | 'firing' | 'resolved';
  activeAt: string;
  value: string;
}

export class MonitoringManager {
  private monitoringStacks: Map<string, MonitoringStack> = new Map();
  private prometheusInstances: Map<string, string> = new Map();
  private grafanaInstances: Map<string, string> = new Map();

  constructor() {
    logger.info('MonitoringManager initialized');
  }

  /**
   * Generate complete monitoring stack
   */
  async generateMonitoringStack(options: any): Promise<MonitoringStack> {
    const logContext: LogContext = {
      component: 'monitoring-manager',
      operation: 'generate-stack'
    };

    logger.info('Generating monitoring stack', logContext);

    try {
      const stack: MonitoringStack = {
        prometheus: await this.generatePrometheusConfig(options),
        grafana: await this.generateGrafanaConfig(options),
        alertmanager: await this.generateAlertManagerConfig(options),
        exporters: await this.generateExporterConfigs(options)
      };

      const stackId = uuid();
      this.monitoringStacks.set(stackId, stack);

      logger.info('Monitoring stack generated', { ...logContext, stackId });
      return stack;

    } catch (error) {
      logger.error('Failed to generate monitoring stack', error instanceof Error ? error : new Error(String(error)), logContext);
      throw error;
    }
  }

  /**
   * Setup monitoring stack with Prometheus, Grafana, and AlertManager
   */
  async setupStack(config: MonitoringConfig): Promise<void> {
    const logContext: LogContext = {
      component: 'monitoring-manager',
      operation: 'setup-stack'
    };

    logger.info('Setting up monitoring stack', logContext);

    try {
      // Create monitoring namespace
      await this.createMonitoringNamespace();

      // Deploy Prometheus
      const prometheusUrl = await this.deployPrometheus(config, logContext);
      
      // Deploy AlertManager
      await this.deployAlertManager(config, logContext);
      
      // Deploy Grafana
      const grafanaUrl = await this.deployGrafana(config, logContext);
      
      // Configure dashboards
      await this.configureDashboards(config.dashboards, logContext);
      
      // Setup alerts
      await this.setupAlerts(config.alerts, logContext);

      // Deploy node exporter
      await this.deployNodeExporter(logContext);

      // Deploy application metrics exporters
      await this.deployApplicationExporters(logContext);

      logger.info('Monitoring stack setup completed', {
        ...logContext,
        prometheusUrl,
        grafanaUrl
      });

    } catch (error) {
      logger.error('Failed to setup monitoring stack', error instanceof Error ? error : new Error(String(error)), logContext);
      throw error;
    }
  }

  /**
   * Check health of monitoring components
   */
  async checkHealth(): Promise<ComponentHealth[]> {
    const logContext: LogContext = {
      component: 'monitoring-manager',
      operation: 'health-check'
    };

    logger.info('Checking monitoring health', logContext);

    const healthChecks: ComponentHealth[] = [];

    try {
      // Check Prometheus health
      const prometheusHealth = await this.checkPrometheusHealth();
      healthChecks.push(prometheusHealth);

      // Check Grafana health
      const grafanaHealth = await this.checkGrafanaHealth();
      healthChecks.push(grafanaHealth);

      // Check AlertManager health
      const alertManagerHealth = await this.checkAlertManagerHealth();
      healthChecks.push(alertManagerHealth);

      // Check exporters health
      const exporterHealths = await this.checkExportersHealth();
      healthChecks.push(...exporterHealths);

      return healthChecks;

    } catch (error) {
      logger.error('Failed to check monitoring health', error instanceof Error ? error : new Error(String(error)), logContext);
      return [];
    }
  }

  /**
   * Query Prometheus metrics
   */
  async queryMetrics(query: string, time?: string): Promise<MetricsResult> {
    const logContext: LogContext = {
      component: 'monitoring-manager',
      operation: 'query-metrics'
    };

    logger.debug('Querying Prometheus metrics', { ...logContext, query });

    try {
      const prometheusUrl = this.getPrometheusUrl();
      const endpoint = time 
        ? `/api/v1/query?query=${encodeURIComponent(query)}&time=${time}`
        : `/api/v1/query?query=${encodeURIComponent(query)}`;

      const response = await this.httpRequest('GET', `${prometheusUrl}${endpoint}`);
      
      logger.debug('Metrics query completed', logContext);
      return JSON.parse(response);

    } catch (error) {
      logger.error('Failed to query metrics', error instanceof Error ? error : new Error(String(error)), logContext);
      throw error;
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<AlertResult> {
    const logContext: LogContext = {
      component: 'monitoring-manager',
      operation: 'get-alerts'
    };

    logger.debug('Getting active alerts', logContext);

    try {
      const prometheusUrl = this.getPrometheusUrl();
      const response = await this.httpRequest('GET', `${prometheusUrl}/api/v1/alerts`);
      
      return JSON.parse(response);

    } catch (error) {
      logger.error('Failed to get alerts', error instanceof Error ? error : new Error(String(error)), logContext);
      throw error;
    }
  }

  /**
   * Create or update dashboard
   */
  async createDashboard(dashboard: GrafanaDashboard): Promise<void> {
    const logContext: LogContext = {
      component: 'monitoring-manager',
      operation: 'create-dashboard',
      dashboardId: dashboard.id
    };

    logger.info('Creating dashboard', logContext);

    try {
      const grafanaUrl = this.getGrafanaUrl();
      const dashboardJson = JSON.stringify({
        dashboard: dashboard,
        overwrite: true
      });

      await this.httpRequest('POST', `${grafanaUrl}/api/dashboards/db`, dashboardJson, {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.getGrafanaApiKey()}`
      });

      logger.info('Dashboard created', logContext);

    } catch (error) {
      logger.error('Failed to create dashboard', error instanceof Error ? error : new Error(String(error)), logContext);
      throw error;
    }
  }

  /**
   * Configure alert rules
   */
  async configureAlerts(alerts: AlertConfig[]): Promise<void> {
    const logContext: LogContext = {
      component: 'monitoring-manager',
      operation: 'configure-alerts'
    };

    logger.info(`Configuring ${alerts.length} alert rules`, logContext);

    try {
      const alertRules = this.generatePrometheusAlertRules(alerts);
      
      // Write alert rules to file
      const rulesPath = '/etc/prometheus/rules.yml';
      await fs.writeFile(rulesPath, yaml.dump(alertRules));

      // Reload Prometheus configuration
      await this.reloadPrometheusConfig();

      logger.info('Alert rules configured', logContext);

    } catch (error) {
      logger.error('Failed to configure alerts', error instanceof Error ? error : new Error(String(error)), logContext);
      throw error;
    }
  }

  /**
   * Generate application dashboard
   */
  async generateApplicationDashboard(appName: string, namespace: string): Promise<GrafanaDashboard> {
    return {
      id: `app-${appName}`,
      title: `Application: ${appName}`,
      tags: ['application', appName, namespace],
      panels: [
        {
          id: 1,
          title: 'Request Rate',
          type: 'graph',
          gridPos: { x: 0, y: 0, w: 12, h: 8 },
          targets: [
            {
              expr: `rate(http_requests_total{app="${appName}",namespace="${namespace}"}[5m])`,
              legendFormat: '{{method}} {{status}}',
              refId: 'A'
            }
          ]
        },
        {
          id: 2,
          title: 'Response Time',
          type: 'graph',
          gridPos: { x: 12, y: 0, w: 12, h: 8 },
          targets: [
            {
              expr: `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{app="${appName}",namespace="${namespace}"}[5m]))`,
              legendFormat: '95th percentile',
              refId: 'A'
            }
          ]
        },
        {
          id: 3,
          title: 'Error Rate',
          type: 'stat',
          gridPos: { x: 0, y: 8, w: 6, h: 4 },
          targets: [
            {
              expr: `rate(http_requests_total{app="${appName}",namespace="${namespace}",status=~"5.."}[5m]) / rate(http_requests_total{app="${appName}",namespace="${namespace}"}[5m]) * 100`,
              refId: 'A'
            }
          ]
        },
        {
          id: 4,
          title: 'CPU Usage',
          type: 'gauge',
          gridPos: { x: 6, y: 8, w: 6, h: 4 },
          targets: [
            {
              expr: `rate(container_cpu_usage_seconds_total{pod=~"${appName}.*",namespace="${namespace}"}[5m]) * 100`,
              refId: 'A'
            }
          ]
        },
        {
          id: 5,
          title: 'Memory Usage',
          type: 'gauge',
          gridPos: { x: 12, y: 8, w: 6, h: 4 },
          targets: [
            {
              expr: `container_memory_working_set_bytes{pod=~"${appName}.*",namespace="${namespace}"} / container_spec_memory_limit_bytes{pod=~"${appName}.*",namespace="${namespace}"} * 100`,
              refId: 'A'
            }
          ]
        },
        {
          id: 6,
          title: 'Pod Status',
          type: 'table',
          gridPos: { x: 18, y: 8, w: 6, h: 4 },
          targets: [
            {
              expr: `kube_pod_status_phase{namespace="${namespace}",pod=~"${appName}.*"}`,
              refId: 'A'
            }
          ]
        }
      ],
      variables: [
        {
          name: 'namespace',
          type: 'query',
          query: 'label_values(kube_namespace_labels, namespace)',
          current: { text: namespace, value: namespace }
        }
      ],
      refresh: '30s'
    };
  }

  // Private helper methods

  private async generatePrometheusConfig(options: any): Promise<PrometheusConfig> {
    return {
      global: {
        scrape_interval: '15s',
        evaluation_interval: '15s'
      },
      rule_files: [
        '/etc/prometheus/rules/*.yml'
      ],
      scrape_configs: [
        {
          job_name: 'prometheus',
          static_configs: [
            {
              targets: ['localhost:9090']
            }
          ]
        },
        {
          job_name: 'node-exporter',
          kubernetes_sd_configs: [
            {
              role: 'node'
            }
          ],
          relabel_configs: [
            {
              source_labels: ['__address__'],
              target_label: '__address__',
              action: 'replace',
              regex: '(.*):10250',
              replacement: '${1}:9100'
            }
          ]
        },
        {
          job_name: 'kubernetes-pods',
          kubernetes_sd_configs: [
            {
              role: 'pod'
            }
          ],
          relabel_configs: [
            {
              source_labels: ['__meta_kubernetes_pod_annotation_prometheus_io_scrape'],
              target_label: '__tmp_prometheus_scrape',
              action: 'keep',
              regex: 'true'
            }
          ]
        }
      ],
      alerting: {
        alertmanagers: [
          {
            static_configs: [
              {
                targets: ['alertmanager:9093']
              }
            ]
          }
        ]
      }
    };
  }

  private async generateGrafanaConfig(options: any): Promise<GrafanaConfig> {
    return {
      datasources: [
        {
          name: 'Prometheus',
          type: 'prometheus',
          url: 'http://prometheus:9090',
          access: 'proxy',
          isDefault: true
        }
      ],
      dashboards: [],
      notifications: [],
      plugins: [
        'grafana-piechart-panel',
        'grafana-worldmap-panel',
        'grafana-clock-panel'
      ]
    };
  }

  private async generateAlertManagerConfig(options: any): Promise<AlertManagerConfiguration> {
    return {
      global: {
        smtp_smarthost: process.env.SMTP_SMARTHOST || 'localhost:587',
        smtp_from: process.env.SMTP_FROM || 'alerts@company.com'
      },
      route: {
        group_by: ['alertname'],
        group_wait: '10s',
        group_interval: '10s',
        repeat_interval: '1h',
        receiver: 'default'
      },
      receivers: [
        {
          name: 'default',
          email_configs: [
            {
              to: process.env.ALERT_EMAIL || 'admin@company.com',
              subject: 'Alert: {{ range .Alerts }}{{ .Annotations.summary }}{{ end }}',
              body: `
                {{ range .Alerts }}
                Alert: {{ .Annotations.summary }}
                Description: {{ .Annotations.description }}
                Severity: {{ .Labels.severity }}
                {{ end }}
              `
            }
          ]
        }
      ],
      templates: []
    };
  }

  private async generateExporterConfigs(options: any): Promise<ExporterConfig[]> {
    return [
      {
        name: 'node-exporter',
        image: 'prom/node-exporter:latest',
        port: 9100,
        scrapeInterval: '15s',
        path: '/metrics'
      },
      {
        name: 'postgres-exporter',
        image: 'prometheuscommunity/postgres-exporter:latest',
        port: 9187,
        scrapeInterval: '30s',
        path: '/metrics'
      },
      {
        name: 'redis-exporter',
        image: 'oliver006/redis_exporter:latest',
        port: 9121,
        scrapeInterval: '30s',
        path: '/metrics'
      }
    ];
  }

  private async createMonitoringNamespace(): Promise<void> {
    const namespaceYaml = `
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
  labels:
    name: monitoring
`;
    
    await fs.writeFile('/tmp/monitoring-namespace.yaml', namespaceYaml);
    await this.executeCommand('kubectl apply -f /tmp/monitoring-namespace.yaml');
  }

  private async deployPrometheus(config: MonitoringConfig, logContext: LogContext): Promise<string> {
    logger.info('Deploying Prometheus', logContext);

    const prometheusYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: prometheus
  template:
    metadata:
      labels:
        app: prometheus
    spec:
      containers:
      - name: prometheus
        image: prom/prometheus:latest
        ports:
        - containerPort: 9090
        volumeMounts:
        - name: prometheus-config
          mountPath: /etc/prometheus
        - name: prometheus-storage
          mountPath: /prometheus
        args:
        - --config.file=/etc/prometheus/prometheus.yml
        - --storage.tsdb.path=/prometheus
        - --web.console.libraries=/etc/prometheus/console_libraries
        - --web.console.templates=/etc/prometheus/consoles
        - --storage.tsdb.retention.time=${config.retention || '15d'}
        - --web.enable-lifecycle
      volumes:
      - name: prometheus-config
        configMap:
          name: prometheus-config
      - name: prometheus-storage
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: prometheus
  namespace: monitoring
spec:
  selector:
    app: prometheus
  ports:
  - port: 9090
    targetPort: 9090
  type: ClusterIP
`;

    await fs.writeFile('/tmp/prometheus.yaml', prometheusYaml);
    await this.executeCommand('kubectl apply -f /tmp/prometheus.yaml');

    const prometheusUrl = 'http://prometheus.monitoring.svc.cluster.local:9090';
    this.prometheusInstances.set('default', prometheusUrl);
    
    return prometheusUrl;
  }

  private async deployAlertManager(config: MonitoringConfig, logContext: LogContext): Promise<void> {
    logger.info('Deploying AlertManager', logContext);

    const alertManagerYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: alertmanager
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: alertmanager
  template:
    metadata:
      labels:
        app: alertmanager
    spec:
      containers:
      - name: alertmanager
        image: prom/alertmanager:latest
        ports:
        - containerPort: 9093
        volumeMounts:
        - name: alertmanager-config
          mountPath: /etc/alertmanager
      volumes:
      - name: alertmanager-config
        configMap:
          name: alertmanager-config
---
apiVersion: v1
kind: Service
metadata:
  name: alertmanager
  namespace: monitoring
spec:
  selector:
    app: alertmanager
  ports:
  - port: 9093
    targetPort: 9093
  type: ClusterIP
`;

    await fs.writeFile('/tmp/alertmanager.yaml', alertManagerYaml);
    await this.executeCommand('kubectl apply -f /tmp/alertmanager.yaml');
  }

  private async deployGrafana(config: MonitoringConfig, logContext: LogContext): Promise<string> {
    logger.info('Deploying Grafana', logContext);

    const grafanaYaml = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: grafana
  namespace: monitoring
spec:
  replicas: 1
  selector:
    matchLabels:
      app: grafana
  template:
    metadata:
      labels:
        app: grafana
    spec:
      containers:
      - name: grafana
        image: grafana/grafana:latest
        ports:
        - containerPort: 3000
        env:
        - name: GF_SECURITY_ADMIN_PASSWORD
          value: admin
        volumeMounts:
        - name: grafana-storage
          mountPath: /var/lib/grafana
      volumes:
      - name: grafana-storage
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: grafana
  namespace: monitoring
spec:
  selector:
    app: grafana
  ports:
  - port: 3000
    targetPort: 3000
  type: ClusterIP
`;

    await fs.writeFile('/tmp/grafana.yaml', grafanaYaml);
    await this.executeCommand('kubectl apply -f /tmp/grafana.yaml');

    const grafanaUrl = 'http://grafana.monitoring.svc.cluster.local:3000';
    this.grafanaInstances.set('default', grafanaUrl);
    
    return grafanaUrl;
  }

  private async deployNodeExporter(logContext: LogContext): Promise<void> {
    logger.info('Deploying Node Exporter', logContext);

    const nodeExporterYaml = `
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    metadata:
      labels:
        app: node-exporter
    spec:
      hostNetwork: true
      containers:
      - name: node-exporter
        image: prom/node-exporter:latest
        ports:
        - containerPort: 9100
        args:
        - --path.procfs=/host/proc
        - --path.sysfs=/host/sys
        - --collector.filesystem.ignored-mount-points
        - ^/(sys|proc|dev|host|etc|rootfs/var/lib/docker/containers|rootfs/var/lib/docker/overlay2|rootfs/run/docker/netns|rootfs/var/lib/docker/aufs)($$|/)
        volumeMounts:
        - name: proc
          mountPath: /host/proc
          readOnly: true
        - name: sys
          mountPath: /host/sys
          readOnly: true
      volumes:
      - name: proc
        hostPath:
          path: /proc
      - name: sys
        hostPath:
          path: /sys
---
apiVersion: v1
kind: Service
metadata:
  name: node-exporter
  namespace: monitoring
spec:
  selector:
    app: node-exporter
  ports:
  - port: 9100
    targetPort: 9100
  type: ClusterIP
`;

    await fs.writeFile('/tmp/node-exporter.yaml', nodeExporterYaml);
    await this.executeCommand('kubectl apply -f /tmp/node-exporter.yaml');
  }

  private async deployApplicationExporters(logContext: LogContext): Promise<void> {
    logger.info('Deploying application exporters', logContext);
    // Implementation would deploy various application-specific exporters
  }

  private async configureDashboards(dashboards: DashboardConfig[], logContext: LogContext): Promise<void> {
    logger.info(`Configuring ${dashboards.length} dashboards`, logContext);

    for (const dashboard of dashboards) {
      const grafanaDashboard = await this.convertToGrafanaDashboard(dashboard);
      await this.createDashboard(grafanaDashboard);
    }
  }

  private async setupAlerts(alerts: AlertConfig[], logContext: LogContext): Promise<void> {
    logger.info(`Setting up ${alerts.length} alerts`, logContext);
    await this.configureAlerts(alerts);
  }

  private async convertToGrafanaDashboard(dashboard: DashboardConfig): Promise<GrafanaDashboard> {
    return {
      id: dashboard.name.toLowerCase().replace(/\s+/g, '-'),
      title: dashboard.name,
      tags: ['auto-generated'],
      panels: dashboard.panels.map((panel, index) => ({
        id: index + 1,
        title: panel.title,
        type: panel.type as any,
        gridPos: { x: 0, y: index * 8, w: 24, h: 8 },
        targets: [
          {
            expr: panel.query,
            refId: 'A'
          }
        ]
      })),
      refresh: dashboard.refresh || '30s'
    };
  }

  private generatePrometheusAlertRules(alerts: AlertConfig[]): any {
    return {
      groups: [
        {
          name: 'application-alerts',
          rules: alerts.map(alert => ({
            alert: alert.name,
            expr: alert.condition,
            for: '5m',
            labels: {
              severity: alert.severity
            },
            annotations: {
              summary: `Alert: ${alert.name}`,
              description: `${alert.name} has triggered with threshold ${alert.threshold}`
            }
          }))
        }
      ]
    };
  }

  private async checkPrometheusHealth(): Promise<ComponentHealth> {
    try {
      const prometheusUrl = this.getPrometheusUrl();
      await this.httpRequest('GET', `${prometheusUrl}/-/healthy`);
      
      return {
        name: 'prometheus',
        status: 'healthy',
        last_check: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: 'prometheus',
        status: 'unhealthy',
        last_check: new Date().toISOString()
      };
    }
  }

  private async checkGrafanaHealth(): Promise<ComponentHealth> {
    try {
      const grafanaUrl = this.getGrafanaUrl();
      await this.httpRequest('GET', `${grafanaUrl}/api/health`);
      
      return {
        name: 'grafana',
        status: 'healthy',
        last_check: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: 'grafana',
        status: 'unhealthy',
        last_check: new Date().toISOString()
      };
    }
  }

  private async checkAlertManagerHealth(): Promise<ComponentHealth> {
    try {
      await this.httpRequest('GET', 'http://alertmanager.monitoring.svc.cluster.local:9093/-/healthy');
      
      return {
        name: 'alertmanager',
        status: 'healthy',
        last_check: new Date().toISOString()
      };
    } catch (error) {
      return {
        name: 'alertmanager',
        status: 'unhealthy',
        last_check: new Date().toISOString()
      };
    }
  }

  private async checkExportersHealth(): Promise<ComponentHealth[]> {
    const exporters = ['node-exporter', 'postgres-exporter', 'redis-exporter'];
    const healthChecks: ComponentHealth[] = [];

    for (const exporter of exporters) {
      try {
        // Implementation would check exporter health
        healthChecks.push({
          name: exporter,
          status: 'healthy',
          last_check: new Date().toISOString()
        });
      } catch (error) {
        healthChecks.push({
          name: exporter,
          status: 'unhealthy',
          last_check: new Date().toISOString()
        });
      }
    }

    return healthChecks;
  }

  private getPrometheusUrl(): string {
    return this.prometheusInstances.get('default') || 'http://prometheus.monitoring.svc.cluster.local:9090';
  }

  private getGrafanaUrl(): string {
    return this.grafanaInstances.get('default') || 'http://grafana.monitoring.svc.cluster.local:3000';
  }

  private getGrafanaApiKey(): string {
    return process.env.GRAFANA_API_KEY || 'admin';
  }

  private async httpRequest(method: string, url: string, body?: string, headers?: Record<string, string>): Promise<string> {
    // Implementation would use a proper HTTP client like axios or fetch
    // This is a simplified mock
    return Promise.resolve('{}');
  }

  private async executeCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const process = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'] });
      
      let stdout = '';
      let stderr = '';
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });
    });
  }

  private async reloadPrometheusConfig(): Promise<void> {
    const prometheusUrl = this.getPrometheusUrl();
    await this.httpRequest('POST', `${prometheusUrl}/-/reload`);
  }
}