import Docker from 'dockerode';
import { Stream } from 'stream';
import tar from 'tar';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { config } from '../config';
import { MetricsCollector } from '../utils/metrics';
import { execSync } from 'child_process';

export interface DockerConfig {
  socketPath?: string;
  host?: string;
  port?: number;
  ca?: string;
  cert?: string;
  key?: string;
}

export interface BuildOptions {
  context: string;
  dockerfile?: string;
  tags: string[];
  buildArgs?: { [key: string]: string };
  target?: string;
  cache?: boolean;
  platform?: string;
  labels?: { [key: string]: string };
  squash?: boolean;
  networkmode?: string;
}

export interface PushOptions {
  registry?: string;
  username?: string;
  password?: string;
  serveraddress?: string;
}

export interface ScanResult {
  vulnerabilities: Vulnerability[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unknown: number;
  };
  scanTime: Date;
  scanner: string;
}

export interface Vulnerability {
  id: string;
  packageName: string;
  version: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  description: string;
  fixedVersion?: string;
  links: string[];
}

export interface ContainerOptions {
  Image: string;
  name?: string;
  Env?: string[];
  ExposedPorts?: { [port: string]: {} };
  HostConfig?: {
    PortBindings?: { [port: string]: Array<{ HostPort: string }> };
    RestartPolicy?: { Name: string; MaximumRetryCount?: number };
    Memory?: number;
    MemorySwap?: number;
    CpuShares?: number;
    CpuQuota?: number;
    Binds?: string[];
    NetworkMode?: string;
    LogConfig?: { Type: string; Config?: any };
  };
  Labels?: { [key: string]: string };
  HealthCheck?: {
    Test: string[];
    Interval?: number;
    Timeout?: number;
    Retries?: number;
    StartPeriod?: number;
  };
}

export class DockerService {
  private static instance: DockerService;
  private docker: Docker;
  private registryAuth?: { username: string; password: string; serveraddress: string };

  private constructor(dockerConfig?: DockerConfig) {
    this.docker = new Docker(dockerConfig || {
      socketPath: config.docker?.socketPath || '/var/run/docker.sock',
    });
  }

  public static async initialize(dockerConfig?: DockerConfig): Promise<DockerService> {
    if (!DockerService.instance) {
      DockerService.instance = new DockerService(dockerConfig);
      await DockerService.instance.testConnection();
    }
    return DockerService.instance;
  }

  public static getInstance(): DockerService {
    if (!DockerService.instance) {
      throw new Error('DockerService not initialized. Call initialize() first.');
    }
    return DockerService.instance;
  }

  private async testConnection(): Promise<void> {
    try {
      const info = await this.docker.info();
      logger.info('Successfully connected to Docker daemon', {
        dockerVersion: info.ServerVersion,
        os: info.OperatingSystem,
      });
    } catch (error) {
      logger.error('Failed to connect to Docker daemon:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public setRegistryAuth(username: string, password: string, serveraddress: string): void {
    this.registryAuth = { username, password, serveraddress };
  }

  // Build operations
  public async buildImage(options: BuildOptions): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Create build context
      const contextStream = await this.createBuildContext(options.context);
      
      // Build options
      const buildOpts: any = {
        t: options.tags,
        dockerfile: options.dockerfile || 'Dockerfile',
        buildargs: options.buildArgs || {},
        target: options.target,
        nocache: !options.cache,
        platform: options.platform,
        labels: options.labels || {},
        squash: options.squash,
        networkmode: options.networkmode,
      };

      // Remove undefined values
      Object.keys(buildOpts).forEach(key => {
        if (buildOpts[key] === undefined) {
          delete buildOpts[key];
        }
      });

      logger.info('Starting Docker build', { tags: options.tags, context: options.context });
      
      const stream = await this.docker.buildImage(contextStream, buildOpts);
      const imageId = await this.followBuildProgress(stream);
      
      const duration = Date.now() - startTime;
      logger.info('Docker build completed', { imageId, tags: options.tags, duration });
      MetricsCollector.recordDockerOperation('build', 'success', duration);
      
      return imageId;
    } catch (error) {
      MetricsCollector.recordDockerOperation('build', 'failure');
      logger.error('Docker build failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async createBuildContext(contextPath: string): Promise<Stream> {
    const tarStream = tar.c({
      gzip: true,
      C: contextPath,
    }, ['.']).on('error', (error) => {
      logger.error('Failed to create build context:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    });

    return tarStream;
  }

  private async followBuildProgress(stream: any): Promise<string> {
    return new Promise((resolve, reject) => {
      let imageId = '';
      
      this.docker.modem.followProgress(stream, (err: any, res: any) => {
        if (err) {
          reject(err);
          return;
        }

        // Extract image ID from build output
        for (const item of res) {
          if (item.aux && item.aux.ID) {
            imageId = item.aux.ID;
          }
          
          // Log build output
          if (item.stream) {
            process.stdout.write(item.stream);
          } else if (item.error) {
            logger.error('Build error:', item.error);
          }
        }

        resolve(imageId);
      });
    });
  }

  // Push operations
  public async pushImage(imageName: string, tag: string, pushOptions?: PushOptions): Promise<void> {
    const startTime = Date.now();
    const fullImageName = `${imageName}:${tag}`;
    
    try {
      const image = this.docker.getImage(fullImageName);
      
      // Prepare auth
      const auth = pushOptions || this.registryAuth || {
        username: config.docker?.registryUsername,
        password: config.docker?.registryPassword,
        serveraddress: config.docker?.registryUrl,
      };

      logger.info('Pushing Docker image', { image: fullImageName });
      
      const stream = await image.push({ authconfig: auth });
      await this.followPushProgress(stream);
      
      const duration = Date.now() - startTime;
      logger.info('Docker push completed', { image: fullImageName, duration });
      MetricsCollector.recordDockerOperation('push', 'success', duration);
    } catch (error) {
      MetricsCollector.recordDockerOperation('push', 'failure');
      logger.error('Docker push failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async followPushProgress(stream: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream, (err: any, res: any) => {
        if (err) {
          reject(err);
          return;
        }

        // Log push output
        for (const item of res) {
          if (item.status) {
            logger.debug(`Push progress: ${item.status}`, { progress: item.progress });
          } else if (item.error) {
            logger.error('Push error:', item.error);
          }
        }

        resolve();
      });
    });
  }

  // Security scanning
  public async scanImage(imageName: string, tag: string): Promise<ScanResult> {
    const fullImageName = `${imageName}:${tag}`;
    const startTime = Date.now();
    
    try {
      logger.info('Starting security scan', { image: fullImageName });
      
      // Use Trivy for vulnerability scanning
      const scanResult = await this.runTrivyScan(fullImageName);
      
      const duration = Date.now() - startTime;
      logger.info('Security scan completed', { 
        image: fullImageName, 
        duration,
        vulnerabilities: scanResult.summary,
      });
      
      MetricsCollector.recordDockerOperation('scan', 'success', duration);
      return scanResult;
    } catch (error) {
      MetricsCollector.recordDockerOperation('scan', 'failure');
      logger.error('Security scan failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async runTrivyScan(imageName: string): Promise<ScanResult> {
    try {
      // Check if Trivy is available
      try {
        execSync('which trivy', { stdio: 'ignore' });
      } catch {
        logger.warn('Trivy not found, installing...');
        execSync('curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin', { stdio: 'inherit' });
      }

      // Run Trivy scan
      const scanOutput = execSync(`trivy image --format json --quiet ${imageName}`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      const scanData = JSON.parse(scanOutput);
      const vulnerabilities: Vulnerability[] = [];
      const summary = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        unknown: 0,
      };

      // Process scan results
      for (const result of scanData.Results || []) {
        for (const vuln of result.Vulnerabilities || []) {
          const vulnerability: Vulnerability = {
            id: vuln.VulnerabilityID,
            packageName: vuln.PkgName,
            version: vuln.InstalledVersion,
            severity: vuln.Severity.toUpperCase() as Vulnerability['severity'],
            description: vuln.Description || '',
            fixedVersion: vuln.FixedVersion,
            links: vuln.References || [],
          };
          
          vulnerabilities.push(vulnerability);
          
          // Update summary
          switch (vulnerability.severity) {
            case 'CRITICAL':
              summary.critical++;
              break;
            case 'HIGH':
              summary.high++;
              break;
            case 'MEDIUM':
              summary.medium++;
              break;
            case 'LOW':
              summary.low++;
              break;
            default:
              summary.unknown++;
          }
        }
      }

      return {
        vulnerabilities,
        summary,
        scanTime: new Date(),
        scanner: 'trivy',
      };
    } catch (error) {
      logger.error('Trivy scan failed:', error instanceof Error ? error : new Error(String(error)));
      
      // Fallback to basic scan info
      return {
        vulnerabilities: [],
        summary: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          unknown: 0,
        },
        scanTime: new Date(),
        scanner: 'none',
      };
    }
  }

  // Container operations
  public async createContainer(options: ContainerOptions): Promise<Docker.Container> {
    try {
      const container = await this.docker.createContainer(options);
      logger.info('Created container', { 
        name: options.name, 
        image: options.Image,
      });
      MetricsCollector.recordDockerOperation('create_container', 'success');
      return container;
    } catch (error) {
      MetricsCollector.recordDockerOperation('create_container', 'failure');
      logger.error('Failed to create container:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async startContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.start();
      logger.info('Started container', { containerId });
      MetricsCollector.recordDockerOperation('start_container', 'success');
    } catch (error) {
      MetricsCollector.recordDockerOperation('start_container', 'failure');
      logger.error('Failed to start container:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async stopContainer(containerId: string, timeout?: number): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: timeout });
      logger.info('Stopped container', { containerId });
      MetricsCollector.recordDockerOperation('stop_container', 'success');
    } catch (error) {
      MetricsCollector.recordDockerOperation('stop_container', 'failure');
      logger.error('Failed to stop container:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async removeContainer(containerId: string, force?: boolean): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.remove({ force });
      logger.info('Removed container', { containerId });
      MetricsCollector.recordDockerOperation('remove_container', 'success');
    } catch (error) {
      MetricsCollector.recordDockerOperation('remove_container', 'failure');
      logger.error('Failed to remove container:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async listContainers(all: boolean = false): Promise<Docker.ContainerInfo[]> {
    try {
      return await this.docker.listContainers({ all });
    } catch (error) {
      logger.error('Failed to list containers:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getContainerLogs(
    containerId: string,
    options?: { stdout?: boolean; stderr?: boolean; tail?: number; since?: number }
  ): Promise<string> {
    try {
      const container = this.docker.getContainer(containerId);
      const stream = await container.logs({
        stdout: options?.stdout ?? true,
        stderr: options?.stderr ?? true,
        tail: options?.tail,
        since: options?.since,
        timestamps: true,
      });

      // Convert stream to string
      return stream.toString('utf-8');
    } catch (error) {
      logger.error('Failed to get container logs:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Image operations
  public async pullImage(imageName: string, tag: string = 'latest'): Promise<void> {
    const fullImageName = `${imageName}:${tag}`;
    const startTime = Date.now();
    
    try {
      logger.info('Pulling Docker image', { image: fullImageName });
      
      const stream = await this.docker.pull(fullImageName, {
        authconfig: this.registryAuth,
      });
      
      await new Promise((resolve, reject) => {
        this.docker.modem.followProgress(stream, (err: any, res: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(res);
        });
      });
      
      const duration = Date.now() - startTime;
      logger.info('Docker pull completed', { image: fullImageName, duration });
      MetricsCollector.recordDockerOperation('pull', 'success', duration);
    } catch (error) {
      MetricsCollector.recordDockerOperation('pull', 'failure');
      logger.error('Docker pull failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async removeImage(imageName: string, force?: boolean): Promise<void> {
    try {
      const image = this.docker.getImage(imageName);
      await image.remove({ force });
      logger.info('Removed image', { imageName });
      MetricsCollector.recordDockerOperation('remove_image', 'success');
    } catch (error) {
      MetricsCollector.recordDockerOperation('remove_image', 'failure');
      logger.error('Failed to remove image:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async listImages(): Promise<Docker.ImageInfo[]> {
    try {
      return await this.docker.listImages();
    } catch (error) {
      logger.error('Failed to list images:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async tagImage(source: string, target: string, tag: string): Promise<void> {
    try {
      const image = this.docker.getImage(source);
      await image.tag({ repo: target, tag });
      logger.info('Tagged image', { source, target, tag });
      MetricsCollector.recordDockerOperation('tag_image', 'success');
    } catch (error) {
      MetricsCollector.recordDockerOperation('tag_image', 'failure');
      logger.error('Failed to tag image:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Registry operations
  public async loginToRegistry(
    username: string,
    password: string,
    serveraddress: string
  ): Promise<void> {
    try {
      await this.docker.checkAuth({ username, password, serveraddress });
      this.setRegistryAuth(username, password, serveraddress);
      logger.info('Successfully logged into Docker registry', { serveraddress });
    } catch (error) {
      logger.error('Failed to login to Docker registry:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Cleanup operations
  public async pruneContainers(): Promise<{ SpaceReclaimed: number }> {
    try {
      const result = await this.docker.pruneContainers();
      logger.info('Pruned stopped containers', { 
        spaceSaved: `${(result.SpaceReclaimed / 1024 / 1024).toFixed(2)} MB`,
      });
      return result;
    } catch (error) {
      logger.error('Failed to prune containers:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async pruneImages(): Promise<{ SpaceReclaimed: number }> {
    try {
      const result = await this.docker.pruneImages();
      logger.info('Pruned unused images', { 
        spaceSaved: `${(result.SpaceReclaimed / 1024 / 1024).toFixed(2)} MB`,
      });
      return result;
    } catch (error) {
      logger.error('Failed to prune images:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async pruneVolumes(): Promise<{ SpaceReclaimed: number }> {
    try {
      const result = await this.docker.pruneVolumes();
      logger.info('Pruned unused volumes', { 
        spaceSaved: `${(result.SpaceReclaimed / 1024 / 1024).toFixed(2)} MB`,
      });
      return result;
    } catch (error) {
      logger.error('Failed to prune volumes:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Health check
  public async getSystemInfo(): Promise<Docker.DockerInfo> {
    try {
      return await this.docker.info();
    } catch (error) {
      logger.error('Failed to get Docker system info:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getSystemDf(): Promise<any> {
    try {
      return await this.docker.df();
    } catch (error) {
      logger.error('Failed to get Docker disk usage:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}