import * as k8s from '@kubernetes/client-node';
import { logger } from '../utils/logger';
import { config } from '../config';
import { MetricsCollector } from '../utils/metrics';
import type { V1Deployment, V1Service, V1Pod, V1ConfigMap, V1Secret, V1Namespace } from '@kubernetes/client-node';

export interface KubernetesConfig {
  configPath?: string;
  inCluster?: boolean;
  namespace?: string;
}

export interface DeploymentOptions {
  name: string;
  namespace?: string;
  image: string;
  replicas?: number;
  ports?: { name: string; port: number; targetPort: number }[];
  env?: { name: string; value: string }[];
  resources?: {
    limits?: { cpu?: string; memory?: string };
    requests?: { cpu?: string; memory?: string };
  };
  labels?: { [key: string]: string };
  annotations?: { [key: string]: string };
  strategy?: 'RollingUpdate' | 'Recreate';
  healthCheck?: {
    liveness?: HealthProbe;
    readiness?: HealthProbe;
  };
}

export interface HealthProbe {
  httpGet?: {
    path: string;
    port: number;
  };
  tcpSocket?: {
    port: number;
  };
  exec?: {
    command: string[];
  };
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  successThreshold?: number;
  failureThreshold?: number;
}

export interface ServiceOptions {
  name: string;
  namespace?: string;
  selector: { [key: string]: string };
  ports: { name: string; port: number; targetPort: number; protocol?: string }[];
  type?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  labels?: { [key: string]: string };
  annotations?: { [key: string]: string };
}

export interface PodOptions {
  name: string;
  namespace?: string;
  image: string;
  labels?: { [key: string]: string };
  annotations?: { [key: string]: string };
  env?: { name: string; value: string }[];
  command?: string[];
  args?: string[];
  resources?: {
    limits?: { cpu?: string; memory?: string };
    requests?: { cpu?: string; memory?: string };
  };
}

export interface ConfigMapOptions {
  name: string;
  namespace?: string;
  data: { [key: string]: string };
  labels?: { [key: string]: string };
  annotations?: { [key: string]: string };
}

export interface SecretOptions {
  name: string;
  namespace?: string;
  type?: string;
  data: { [key: string]: string };
  stringData?: { [key: string]: string };
  labels?: { [key: string]: string };
  annotations?: { [key: string]: string };
}

export interface CanaryOptions {
  name: string;
  namespace?: string;
  targetDeployment: string;
  canaryImage: string;
  canaryPercentage: number;
  duration?: number;
  metrics?: {
    successRate?: number;
    latency?: number;
    errorRate?: number;
  };
}

export interface BlueGreenOptions {
  name: string;
  namespace?: string;
  blueDeployment: string;
  greenDeployment: string;
  targetService: string;
  strategy?: 'switch' | 'canary';
  validationTime?: number;
}

export class KubernetesService {
  private static instance: KubernetesService;
  private kc: k8s.KubeConfig;
  private k8sApi: k8s.CoreV1Api;
  private k8sAppsApi: k8s.AppsV1Api;
  private k8sBatchApi: k8s.BatchV1Api;
  private k8sNetworkingApi: k8s.NetworkingV1Api;
  private k8sAutoscalingApi: k8s.AutoscalingV1Api;

  private constructor(config?: KubernetesConfig) {
    this.kc = new k8s.KubeConfig();
    
    if (config?.inCluster) {
      this.kc.loadFromCluster();
    } else if (config?.configPath) {
      this.kc.loadFromFile(config.configPath);
    } else {
      this.kc.loadFromDefault();
    }

    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    this.k8sBatchApi = this.kc.makeApiClient(k8s.BatchV1Api);
    this.k8sNetworkingApi = this.kc.makeApiClient(k8s.NetworkingV1Api);
    this.k8sAutoscalingApi = this.kc.makeApiClient(k8s.AutoscalingV1Api);
  }

  public static async initialize(config?: KubernetesConfig): Promise<KubernetesService> {
    if (!KubernetesService.instance) {
      KubernetesService.instance = new KubernetesService(config);
      await KubernetesService.instance.testConnection();
    }
    return KubernetesService.instance;
  }

  public static getInstance(): KubernetesService {
    if (!KubernetesService.instance) {
      throw new Error('KubernetesService not initialized. Call initialize() first.');
    }
    return KubernetesService.instance;
  }

  private async testConnection(): Promise<void> {
    try {
      await this.k8sApi.listNamespace();
      logger.info('Successfully connected to Kubernetes cluster');
    } catch (error) {
      logger.error('Failed to connect to Kubernetes cluster:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Namespace operations
  public async createNamespace(name: string, labels?: { [key: string]: string }): Promise<V1Namespace> {
    const namespace: V1Namespace = {
      metadata: {
        name,
        labels,
      },
    };

    try {
      const { body } = await this.k8sApi.createNamespace(namespace);
      logger.info(`Created namespace: ${name}`);
      MetricsCollector.recordKubernetesOperation('create_namespace', 'success');
      return body;
    } catch (error) {
      MetricsCollector.recordKubernetesOperation('create_namespace', 'failure');
      throw error;
    }
  }

  public async listNamespaces(): Promise<V1Namespace[]> {
    try {
      const { body } = await this.k8sApi.listNamespace();
      return body.items;
    } catch (error) {
      logger.error('Failed to list namespaces:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Deployment operations
  public async createDeployment(options: DeploymentOptions): Promise<V1Deployment> {
    const namespace = options.namespace || 'default';
    const deployment: V1Deployment = {
      metadata: {
        name: options.name,
        namespace,
        labels: options.labels || {},
        annotations: options.annotations || {},
      },
      spec: {
        replicas: options.replicas || 1,
        selector: {
          matchLabels: {
            app: options.name,
          },
        },
        strategy: {
          type: options.strategy || 'RollingUpdate',
          ...(options.strategy === 'RollingUpdate' && {
            rollingUpdate: {
              maxSurge: '25%',
              maxUnavailable: '25%',
            },
          }),
        },
        template: {
          metadata: {
            labels: {
              app: options.name,
              ...options.labels,
            },
            annotations: options.annotations || {},
          },
          spec: {
            containers: [
              {
                name: options.name,
                image: options.image,
                ports: options.ports?.map(p => ({
                  name: p.name,
                  containerPort: p.targetPort,
                })),
                env: options.env?.map(e => ({
                  name: e.name,
                  value: e.value,
                })),
                resources: options.resources,
                ...(options.healthCheck?.liveness && {
                  livenessProbe: this.createProbe(options.healthCheck.liveness),
                }),
                ...(options.healthCheck?.readiness && {
                  readinessProbe: this.createProbe(options.healthCheck.readiness),
                }),
              },
            ],
          },
        },
      },
    };

    try {
      const { body } = await this.k8sAppsApi.createNamespacedDeployment(namespace, deployment);
      logger.info(`Created deployment: ${options.name} in namespace: ${namespace}`);
      MetricsCollector.recordKubernetesOperation('create_deployment', 'success');
      return body;
    } catch (error) {
      MetricsCollector.recordKubernetesOperation('create_deployment', 'failure');
      throw error;
    }
  }

  public async updateDeployment(
    name: string,
    namespace: string,
    updates: Partial<DeploymentOptions>
  ): Promise<V1Deployment> {
    try {
      const { body: existing } = await this.k8sAppsApi.readNamespacedDeployment(name, namespace);
      
      if (updates.replicas !== undefined && existing.spec) {
        existing.spec.replicas = updates.replicas;
      }
      
      if (updates.image && existing.spec?.template?.spec?.containers?.[0]) {
        existing.spec.template.spec.containers[0].image = updates.image;
      }
      
      if (updates.env && existing.spec?.template?.spec?.containers?.[0]) {
        existing.spec.template.spec.containers[0].env = updates.env.map(e => ({
          name: e.name,
          value: e.value,
        }));
      }

      const { body } = await this.k8sAppsApi.replaceNamespacedDeployment(
        name,
        namespace,
        existing
      );
      
      logger.info(`Updated deployment: ${name} in namespace: ${namespace}`);
      MetricsCollector.recordKubernetesOperation('update_deployment', 'success');
      return body;
    } catch (error) {
      MetricsCollector.recordKubernetesOperation('update_deployment', 'failure');
      throw error;
    }
  }

  public async deleteDeployment(name: string, namespace: string = 'default'): Promise<void> {
    try {
      await this.k8sAppsApi.deleteNamespacedDeployment(name, namespace);
      logger.info(`Deleted deployment: ${name} from namespace: ${namespace}`);
      MetricsCollector.recordKubernetesOperation('delete_deployment', 'success');
    } catch (error) {
      MetricsCollector.recordKubernetesOperation('delete_deployment', 'failure');
      throw error;
    }
  }

  public async getDeployment(name: string, namespace: string = 'default'): Promise<V1Deployment> {
    try {
      const { body } = await this.k8sAppsApi.readNamespacedDeployment(name, namespace);
      return body;
    } catch (error) {
      logger.error(`Failed to get deployment ${name}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async listDeployments(namespace?: string): Promise<V1Deployment[]> {
    try {
      if (namespace) {
        const { body } = await this.k8sAppsApi.listNamespacedDeployment(namespace);
        return body.items;
      } else {
        const { body } = await this.k8sAppsApi.listDeploymentForAllNamespaces();
        return body.items;
      }
    } catch (error) {
      logger.error('Failed to list deployments:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Service operations
  public async createService(options: ServiceOptions): Promise<V1Service> {
    const namespace = options.namespace || 'default';
    const service: V1Service = {
      metadata: {
        name: options.name,
        namespace,
        labels: options.labels || {},
        annotations: options.annotations || {},
      },
      spec: {
        selector: options.selector,
        type: options.type || 'ClusterIP',
        ports: options.ports.map(p => ({
          name: p.name,
          port: p.port,
          targetPort: p.targetPort,
          protocol: p.protocol || 'TCP',
        })),
      },
    };

    try {
      const { body } = await this.k8sApi.createNamespacedService(namespace, service);
      logger.info(`Created service: ${options.name} in namespace: ${namespace}`);
      MetricsCollector.recordKubernetesOperation('create_service', 'success');
      return body;
    } catch (error) {
      MetricsCollector.recordKubernetesOperation('create_service', 'failure');
      throw error;
    }
  }

  public async deleteService(name: string, namespace: string = 'default'): Promise<void> {
    try {
      await this.k8sApi.deleteNamespacedService(name, namespace);
      logger.info(`Deleted service: ${name} from namespace: ${namespace}`);
      MetricsCollector.recordKubernetesOperation('delete_service', 'success');
    } catch (error) {
      MetricsCollector.recordKubernetesOperation('delete_service', 'failure');
      throw error;
    }
  }

  // Pod operations
  public async getPods(namespace?: string, labelSelector?: string): Promise<V1Pod[]> {
    try {
      if (namespace) {
        const { body } = await this.k8sApi.listNamespacedPod(
          namespace,
          undefined,
          undefined,
          undefined,
          undefined,
          labelSelector
        );
        return body.items;
      } else {
        const { body } = await this.k8sApi.listPodForAllNamespaces(
          undefined,
          undefined,
          undefined,
          labelSelector
        );
        return body.items;
      }
    } catch (error) {
      logger.error('Failed to list pods:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getPodLogs(
    name: string,
    namespace: string = 'default',
    container?: string,
    tailLines?: number
  ): Promise<string> {
    try {
      const { body } = await this.k8sApi.readNamespacedPodLog(
        name,
        namespace,
        container,
        false,
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        tailLines
      );
      return body;
    } catch (error) {
      logger.error(`Failed to get logs for pod ${name}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // ConfigMap operations
  public async createConfigMap(
    name: string,
    namespace: string,
    data: { [key: string]: string }
  ): Promise<V1ConfigMap> {
    const configMap: V1ConfigMap = {
      metadata: {
        name,
        namespace,
      },
      data,
    };

    try {
      const { body } = await this.k8sApi.createNamespacedConfigMap(namespace, configMap);
      logger.info(`Created ConfigMap: ${name} in namespace: ${namespace}`);
      return body;
    } catch (error) {
      logger.error(`Failed to create ConfigMap ${name}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Secret operations
  public async createSecret(
    name: string,
    namespace: string,
    data: { [key: string]: string },
    type: string = 'Opaque'
  ): Promise<V1Secret> {
    const secret: V1Secret = {
      metadata: {
        name,
        namespace,
      },
      type,
      stringData: data,
    };

    try {
      const { body } = await this.k8sApi.createNamespacedSecret(namespace, secret);
      logger.info(`Created Secret: ${name} in namespace: ${namespace}`);
      return body;
    } catch (error) {
      logger.error(`Failed to create Secret ${name}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Scaling operations
  public async scaleDeployment(
    name: string,
    namespace: string,
    replicas: number
  ): Promise<V1Deployment> {
    return this.updateDeployment(name, namespace, { replicas });
  }

  // Rolling update
  public async performRollingUpdate(
    name: string,
    namespace: string,
    newImage: string
  ): Promise<V1Deployment> {
    try {
      const deployment = await this.updateDeployment(name, namespace, { image: newImage });
      logger.info(`Started rolling update for deployment: ${name} with image: ${newImage}`);
      return deployment;
    } catch (error) {
      logger.error(`Failed to perform rolling update for ${name}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Rollback
  public async rollbackDeployment(name: string, namespace: string, revision?: number): Promise<void> {
    try {
      // Get deployment history
      const { body: deployment } = await this.k8sAppsApi.readNamespacedDeployment(name, namespace);
      
      // Create a patch to trigger rollback
      const patch = [
        {
          op: 'replace',
          path: '/spec/template',
          value: deployment.spec?.template,
        },
      ];

      await this.k8sAppsApi.patchNamespacedDeployment(
        name,
        namespace,
        patch,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: { 'Content-Type': 'application/json-patch+json' } }
      );

      logger.info(`Rolled back deployment: ${name} in namespace: ${namespace}`);
    } catch (error) {
      logger.error(`Failed to rollback deployment ${name}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Watch operations
  public async watchDeployment(
    name: string,
    namespace: string,
    callback: (phase: string, message: string) => void
  ): Promise<void> {
    const watch = new k8s.Watch(this.kc);
    const path = `/apis/apps/v1/namespaces/${namespace}/deployments`;
    
    try {
      await watch.watch(
        path,
        { fieldSelector: `metadata.name=${name}` },
        (type, obj) => {
          const deployment = obj as V1Deployment;
          const conditions = deployment.status?.conditions || [];
          
          for (const condition of conditions) {
            callback(condition.type || 'Unknown', condition.message || 'No message');
          }
        },
        (err) => {
          logger.error('Watch error:', err);
        }
      );
    } catch (error) {
      logger.error(`Failed to watch deployment ${name}:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Helper methods
  private createProbe(probe: HealthProbe): k8s.V1Probe {
    return {
      ...(probe.httpGet && {
        httpGet: {
          path: probe.httpGet.path,
          port: probe.httpGet.port,
        },
      }),
      ...(probe.tcpSocket && {
        tcpSocket: {
          port: probe.tcpSocket.port,
        },
      }),
      ...(probe.exec && {
        exec: {
          command: probe.exec.command,
        },
      }),
      initialDelaySeconds: probe.initialDelaySeconds || 30,
      periodSeconds: probe.periodSeconds || 10,
      timeoutSeconds: probe.timeoutSeconds || 5,
      successThreshold: probe.successThreshold || 1,
      failureThreshold: probe.failureThreshold || 3,
    };
  }

  // Deployment strategies
  public async performBlueGreenDeployment(
    serviceName: string,
    namespace: string,
    newDeploymentOptions: DeploymentOptions
  ): Promise<{ deployment: V1Deployment; service: V1Service }> {
    try {
      // Create green deployment
      const greenDeploymentName = `${newDeploymentOptions.name}-green`;
      const greenDeployment = await this.createDeployment({
        ...newDeploymentOptions,
        name: greenDeploymentName,
        labels: {
          ...newDeploymentOptions.labels,
          version: 'green',
        },
      });

      // Wait for green deployment to be ready
      await this.waitForDeploymentReady(greenDeploymentName, namespace);

      // Update service to point to green deployment
      const service = await this.switchServiceToGreen(serviceName, namespace, greenDeploymentName);

      // Delete blue deployment
      const blueDeploymentName = `${newDeploymentOptions.name}-blue`;
      try {
        await this.deleteDeployment(blueDeploymentName, namespace);
      } catch (error) {
        // Blue deployment might not exist
        logger.warn(`Blue deployment ${blueDeploymentName} not found or couldn't be deleted`);
      }

      // Rename green to blue for next deployment
      await this.k8sAppsApi.patchNamespacedDeployment(
        greenDeploymentName,
        namespace,
        [
          {
            op: 'replace',
            path: '/metadata/labels/version',
            value: 'blue',
          },
        ],
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { headers: { 'Content-Type': 'application/json-patch+json' } }
      );

      logger.info(`Blue-green deployment completed for ${serviceName}`);
      return { deployment: greenDeployment, service };
    } catch (error) {
      logger.error('Blue-green deployment failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async performCanaryDeployment(
    serviceName: string,
    namespace: string,
    newDeploymentOptions: DeploymentOptions,
    canaryPercentage: number = 10
  ): Promise<{ stableDeployment: V1Deployment; canaryDeployment: V1Deployment }> {
    try {
      // Get current stable deployment
      const stableDeployment = await this.getDeployment(newDeploymentOptions.name, namespace);
      const totalReplicas = stableDeployment.spec?.replicas || 1;
      
      // Calculate canary and stable replicas
      const canaryReplicas = Math.ceil(totalReplicas * (canaryPercentage / 100));
      const stableReplicas = totalReplicas - canaryReplicas;

      // Create canary deployment
      const canaryDeploymentName = `${newDeploymentOptions.name}-canary`;
      const canaryDeployment = await this.createDeployment({
        ...newDeploymentOptions,
        name: canaryDeploymentName,
        replicas: canaryReplicas,
        labels: {
          ...newDeploymentOptions.labels,
          version: 'canary',
        },
      });

      // Scale down stable deployment
      await this.scaleDeployment(newDeploymentOptions.name, namespace, stableReplicas);

      logger.info(`Canary deployment created with ${canaryPercentage}% traffic`);
      return { stableDeployment, canaryDeployment };
    } catch (error) {
      logger.error('Canary deployment failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async waitForDeploymentReady(
    name: string,
    namespace: string,
    timeout: number = 300000
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const deployment = await this.getDeployment(name, namespace);
      const replicas = deployment.spec?.replicas || 1;
      const readyReplicas = deployment.status?.readyReplicas || 0;
      
      if (readyReplicas >= replicas) {
        logger.info(`Deployment ${name} is ready`);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    throw new Error(`Deployment ${name} did not become ready within ${timeout}ms`);
  }

  private async switchServiceToGreen(
    serviceName: string,
    namespace: string,
    greenDeploymentName: string
  ): Promise<V1Service> {
    try {
      const { body: service } = await this.k8sApi.readNamespacedService(serviceName, namespace);
      
      if (service.spec) {
        service.spec.selector = {
          app: greenDeploymentName,
          version: 'green',
        };
      }

      const { body: updatedService } = await this.k8sApi.replaceNamespacedService(
        serviceName,
        namespace,
        service
      );
      
      return updatedService;
    } catch (error) {
      logger.error(`Failed to switch service ${serviceName} to green:`, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}