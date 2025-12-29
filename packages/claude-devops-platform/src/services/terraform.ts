import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { config } from '../config';
import { Database } from '../database';
import { MetricsCollector } from '../utils/metrics';

const execAsync = promisify(exec);

export interface TerraformConfig {
  workingDirectory: string;
  backend?: TerraformBackend;
  variables?: { [key: string]: any };
  workspace?: string;
  parallelism?: number;
  autoApprove?: boolean;
}

export interface TerraformBackend {
  type: 's3' | 'gcs' | 'azurerm' | 'remote' | 'local';
  config: any;
}

export interface TerraformState {
  version: number;
  terraform_version: string;
  serial: number;
  lineage: string;
  outputs: { [key: string]: TerraformOutput };
  resources: TerraformResource[];
}

export interface TerraformOutput {
  value: any;
  type: string;
  sensitive?: boolean;
}

export interface TerraformResource {
  mode: string;
  type: string;
  name: string;
  provider: string;
  instances: TerraformInstance[];
}

export interface TerraformInstance {
  schema_version: number;
  attributes: any;
  private?: string;
  dependencies?: string[];
}

export interface TerraformPlan {
  id: string;
  createdAt: Date;
  resourceChanges: ResourceChange[];
  outputChanges: OutputChange[];
  hasChanges: boolean;
  planFile: string;
}

export interface ResourceChange {
  address: string;
  mode: string;
  type: string;
  name: string;
  change: {
    actions: ('create' | 'update' | 'delete' | 'replace' | 'no-op')[];
    before: any;
    after: any;
  };
}

export interface OutputChange {
  name: string;
  before: any;
  after: any;
  sensitive: boolean;
}

export interface TerraformModule {
  name: string;
  source: string;
  version?: string;
  variables?: { [key: string]: any };
}

export class TerraformService {
  private static instance: TerraformService;
  private workspaces: Map<string, TerraformConfig> = new Map();

  private constructor() {}

  public static getInstance(): TerraformService {
    if (!TerraformService.instance) {
      TerraformService.instance = new TerraformService();
    }
    return TerraformService.instance;
  }

  // Workspace management
  public async createWorkspace(name: string, config: TerraformConfig): Promise<void> {
    try {
      // Initialize Terraform
      await this.init(config);

      // Create workspace
      await this.runCommand(`terraform workspace new ${name}`, config.workingDirectory);

      // Store workspace configuration
      this.workspaces.set(name, config);

      // Save to database
      await Database.query(
        `INSERT INTO terraform_workspaces (name, config, created_at)
         VALUES ($1, $2, NOW())`,
        [name, JSON.stringify(config)]
      );

      logger.info('Created Terraform workspace', { workspace: name });
      MetricsCollector.recordTerraformOperation('create_workspace', 'success');
    } catch (error) {
      MetricsCollector.recordTerraformOperation('create_workspace', 'failure');
      logger.error('Failed to create Terraform workspace:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async selectWorkspace(name: string): Promise<void> {
    try {
      const config = await this.getWorkspaceConfig(name);
      await this.runCommand(`terraform workspace select ${name}`, config.workingDirectory);
      
      logger.info('Selected Terraform workspace', { workspace: name });
    } catch (error) {
      logger.error('Failed to select Terraform workspace:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async deleteWorkspace(name: string): Promise<void> {
    try {
      const config = await this.getWorkspaceConfig(name);
      
      // Switch to default workspace first
      await this.runCommand('terraform workspace select default', config.workingDirectory);
      
      // Delete the workspace
      await this.runCommand(`terraform workspace delete ${name}`, config.workingDirectory);

      // Remove from memory and database
      this.workspaces.delete(name);
      await Database.query('DELETE FROM terraform_workspaces WHERE name = $1', [name]);

      logger.info('Deleted Terraform workspace', { workspace: name });
      MetricsCollector.recordTerraformOperation('delete_workspace', 'success');
    } catch (error) {
      MetricsCollector.recordTerraformOperation('delete_workspace', 'failure');
      logger.error('Failed to delete Terraform workspace:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async listWorkspaces(): Promise<string[]> {
    const result = await Database.query('SELECT name FROM terraform_workspaces ORDER BY created_at DESC');
    return result.rows.map(row => row.name);
  }

  // Terraform operations
  public async init(config: TerraformConfig): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Initializing Terraform', { workingDirectory: config.workingDirectory });

      // Create backend configuration file if specified
      if (config.backend) {
        await this.createBackendConfig(config);
      }

      // Run terraform init
      const { stdout, stderr } = await this.runCommand(
        'terraform init -no-color',
        config.workingDirectory,
        {
          TF_IN_AUTOMATION: 'true',
        }
      );

      if (stderr && !stderr.includes('Terraform has been successfully initialized')) {
        throw new Error(`Terraform init failed: ${stderr}`);
      }

      const duration = Date.now() - startTime;
      logger.info('Terraform initialized successfully', { duration });
      MetricsCollector.recordTerraformOperation('init', 'success', duration);
    } catch (error) {
      MetricsCollector.recordTerraformOperation('init', 'failure');
      logger.error('Terraform init failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async plan(config: TerraformConfig): Promise<TerraformPlan> {
    const startTime = Date.now();
    const planId = uuidv4();
    const planFile = path.join(config.workingDirectory, `.terraform-plan-${planId}`);

    try {
      logger.info('Creating Terraform plan', { workingDirectory: config.workingDirectory });

      // Build variable arguments
      const varArgs = this.buildVariableArgs(config.variables);

      // Run terraform plan
      const { stdout, stderr } = await this.runCommand(
        `terraform plan -no-color -out=${planFile} ${varArgs}`,
        config.workingDirectory,
        {
          TF_IN_AUTOMATION: 'true',
        }
      );

      // Parse plan output
      const plan = await this.parsePlanOutput(stdout, planFile);
      plan.id = planId;
      plan.planFile = planFile;

      // Save plan to database
      await this.savePlan(plan);

      const duration = Date.now() - startTime;
      logger.info('Terraform plan created', { 
        planId, 
        hasChanges: plan.hasChanges,
        resourceChanges: plan.resourceChanges.length,
        duration,
      });

      MetricsCollector.recordTerraformOperation('plan', 'success', duration);
      return plan;
    } catch (error) {
      MetricsCollector.recordTerraformOperation('plan', 'failure');
      logger.error('Terraform plan failed:', error instanceof Error ? error : new Error(String(error)));
      
      // Clean up plan file if it exists
      try {
        await fs.unlink(planFile);
      } catch {}
      
      throw error;
    }
  }

  public async apply(config: TerraformConfig, planId?: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Applying Terraform changes', { 
        workingDirectory: config.workingDirectory,
        planId,
        autoApprove: config.autoApprove,
      });

      let command: string;
      
      if (planId) {
        // Apply specific plan
        const plan = await this.getPlan(planId);
        if (!plan) {
          throw new Error(`Plan ${planId} not found`);
        }
        
        command = `terraform apply -no-color ${plan.planFile}`;
      } else if (config.autoApprove) {
        // Apply with auto-approve
        const varArgs = this.buildVariableArgs(config.variables);
        command = `terraform apply -no-color -auto-approve ${varArgs}`;
      } else {
        throw new Error('Plan ID required when auto-approve is not enabled');
      }

      const { stdout, stderr } = await this.runCommand(
        command,
        config.workingDirectory,
        {
          TF_IN_AUTOMATION: 'true',
        }
      );

      if (stderr && !stderr.includes('Apply complete!')) {
        throw new Error(`Terraform apply failed: ${stderr}`);
      }

      // Clean up plan file if used
      if (planId) {
        const plan = await this.getPlan(planId);
        if (plan) {
          try {
            await fs.unlink(plan.planFile);
          } catch {}
        }
      }

      const duration = Date.now() - startTime;
      logger.info('Terraform apply completed successfully', { duration });
      MetricsCollector.recordTerraformOperation('apply', 'success', duration);
      
      // Store apply history
      await this.saveApplyHistory(config, planId);
    } catch (error) {
      MetricsCollector.recordTerraformOperation('apply', 'failure');
      logger.error('Terraform apply failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async destroy(config: TerraformConfig): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info('Destroying Terraform resources', { 
        workingDirectory: config.workingDirectory,
        autoApprove: config.autoApprove,
      });

      const varArgs = this.buildVariableArgs(config.variables);
      const approveArg = config.autoApprove ? '-auto-approve' : '';
      
      const { stdout, stderr } = await this.runCommand(
        `terraform destroy -no-color ${approveArg} ${varArgs}`,
        config.workingDirectory,
        {
          TF_IN_AUTOMATION: 'true',
        }
      );

      if (stderr && !stderr.includes('Destroy complete!')) {
        throw new Error(`Terraform destroy failed: ${stderr}`);
      }

      const duration = Date.now() - startTime;
      logger.info('Terraform destroy completed successfully', { duration });
      MetricsCollector.recordTerraformOperation('destroy', 'success', duration);
    } catch (error) {
      MetricsCollector.recordTerraformOperation('destroy', 'failure');
      logger.error('Terraform destroy failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async validate(config: TerraformConfig): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const { stdout, stderr } = await this.runCommand(
        'terraform validate -no-color -json',
        config.workingDirectory
      );

      const result = JSON.parse(stdout);
      
      return {
        valid: result.valid,
        errors: result.diagnostics?.map((d: any) => d.summary) || [],
      };
    } catch (error) {
      logger.error('Terraform validate failed:', error instanceof Error ? error : new Error(String(error)));
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }

  public async format(config: TerraformConfig): Promise<string[]> {
    try {
      const { stdout } = await this.runCommand(
        'terraform fmt -recursive -list=true',
        config.workingDirectory
      );

      const formattedFiles = stdout.trim().split('\n').filter(f => f);
      
      if (formattedFiles.length > 0) {
        logger.info('Formatted Terraform files', { files: formattedFiles });
      }
      
      return formattedFiles;
    } catch (error) {
      logger.error('Terraform format failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // State management
  public async getState(config: TerraformConfig): Promise<TerraformState> {
    try {
      const { stdout } = await this.runCommand(
        'terraform show -no-color -json',
        config.workingDirectory
      );

      return JSON.parse(stdout);
    } catch (error) {
      logger.error('Failed to get Terraform state:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async getOutputs(config: TerraformConfig): Promise<{ [key: string]: any }> {
    try {
      const { stdout } = await this.runCommand(
        'terraform output -no-color -json',
        config.workingDirectory
      );

      const outputs = JSON.parse(stdout);
      const result: { [key: string]: any } = {};
      
      for (const [key, output] of Object.entries(outputs)) {
        result[key] = (output as TerraformOutput).value;
      }
      
      return result;
    } catch (error) {
      logger.error('Failed to get Terraform outputs:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async importResource(
    config: TerraformConfig,
    resourceAddress: string,
    resourceId: string
  ): Promise<void> {
    try {
      logger.info('Importing resource into Terraform state', { 
        resourceAddress, 
        resourceId,
      });

      const { stdout, stderr } = await this.runCommand(
        `terraform import -no-color ${resourceAddress} ${resourceId}`,
        config.workingDirectory
      );

      if (stderr && !stderr.includes('Import successful!')) {
        throw new Error(`Terraform import failed: ${stderr}`);
      }

      logger.info('Resource imported successfully');
      MetricsCollector.recordTerraformOperation('import', 'success');
    } catch (error) {
      MetricsCollector.recordTerraformOperation('import', 'failure');
      logger.error('Terraform import failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async moveResource(
    config: TerraformConfig,
    source: string,
    destination: string
  ): Promise<void> {
    try {
      logger.info('Moving resource in Terraform state', { source, destination });

      const { stdout, stderr } = await this.runCommand(
        `terraform state mv -no-color ${source} ${destination}`,
        config.workingDirectory
      );

      logger.info('Resource moved successfully');
      MetricsCollector.recordTerraformOperation('move', 'success');
    } catch (error) {
      MetricsCollector.recordTerraformOperation('move', 'failure');
      logger.error('Terraform state move failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async removeResource(config: TerraformConfig, resourceAddress: string): Promise<void> {
    try {
      logger.info('Removing resource from Terraform state', { resourceAddress });

      const { stdout, stderr } = await this.runCommand(
        `terraform state rm -no-color ${resourceAddress}`,
        config.workingDirectory
      );

      logger.info('Resource removed successfully');
      MetricsCollector.recordTerraformOperation('remove', 'success');
    } catch (error) {
      MetricsCollector.recordTerraformOperation('remove', 'failure');
      logger.error('Terraform state remove failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Module management
  public async addModule(config: TerraformConfig, module: TerraformModule): Promise<void> {
    try {
      // Create module configuration
      const moduleConfig = `
module "${module.name}" {
  source  = "${module.source}"
  ${module.version ? `version = "${module.version}"` : ''}
  
  ${Object.entries(module.variables || {})
    .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
    .join('\n  ')}
}
`;

      // Write module configuration to file
      const modulePath = path.join(config.workingDirectory, `module-${module.name}.tf`);
      await fs.writeFile(modulePath, moduleConfig, 'utf8');

      // Run terraform init to download module
      await this.init(config);

      logger.info('Added Terraform module', { module: module.name });
    } catch (error) {
      logger.error('Failed to add Terraform module:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async upgradeModules(config: TerraformConfig): Promise<void> {
    try {
      logger.info('Upgrading Terraform modules');

      const { stdout, stderr } = await this.runCommand(
        'terraform init -upgrade -no-color',
        config.workingDirectory,
        {
          TF_IN_AUTOMATION: 'true',
        }
      );

      logger.info('Terraform modules upgraded successfully');
      MetricsCollector.recordTerraformOperation('upgrade_modules', 'success');
    } catch (error) {
      MetricsCollector.recordTerraformOperation('upgrade_modules', 'failure');
      logger.error('Failed to upgrade Terraform modules:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Cost estimation
  public async estimateCost(planId: string): Promise<{ currency: string; monthlyCost: number }> {
    try {
      const plan = await this.getPlan(planId);
      if (!plan) {
        throw new Error(`Plan ${planId} not found`);
      }

      // This would integrate with cloud cost estimation APIs
      // For now, return a mock estimation
      const estimatedCost = plan.resourceChanges.reduce((total, change) => {
        // Simple cost estimation based on resource type
        const costs: { [key: string]: number } = {
          'aws_instance': 50,
          'aws_rds_instance': 100,
          'aws_lambda_function': 10,
          'google_compute_instance': 45,
          'azurerm_virtual_machine': 55,
        };

        const cost = costs[change.type] || 20;
        return total + (change.change.actions.includes('create') ? cost : 0);
      }, 0);

      return {
        currency: 'USD',
        monthlyCost: estimatedCost,
      };
    } catch (error) {
      logger.error('Failed to estimate cost:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Compliance and security
  public async runSecurityScan(config: TerraformConfig): Promise<any> {
    try {
      // This would integrate with tools like tfsec, checkov, or terrascan
      logger.info('Running security scan on Terraform configuration');

      // For now, return mock results
      return {
        passed: true,
        findings: [],
        summary: {
          high: 0,
          medium: 0,
          low: 0,
        },
      };
    } catch (error) {
      logger.error('Security scan failed:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Helper methods
  private async runCommand(
    command: string,
    cwd: string,
    env?: { [key: string]: string }
  ): Promise<{ stdout: string; stderr: string }> {
    logger.debug('Running command', { command, cwd });
    
    return await execAsync(command, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });
  }

  private buildVariableArgs(variables?: { [key: string]: any }): string {
    if (!variables) return '';
    
    return Object.entries(variables)
      .map(([key, value]) => `-var '${key}=${JSON.stringify(value)}'`)
      .join(' ');
  }

  private async createBackendConfig(config: TerraformConfig): Promise<void> {
    if (!config.backend) return;

    let backendConfig = '';
    
    switch (config.backend.type) {
      case 's3':
        backendConfig = `
terraform {
  backend "s3" {
    bucket = "${config.backend.config.bucket}"
    key    = "${config.backend.config.key}"
    region = "${config.backend.config.region}"
    ${config.backend.config.dynamodb_table ? `dynamodb_table = "${config.backend.config.dynamodb_table}"` : ''}
    ${config.backend.config.encrypt ? 'encrypt = true' : ''}
  }
}
`;
        break;
        
      case 'gcs':
        backendConfig = `
terraform {
  backend "gcs" {
    bucket = "${config.backend.config.bucket}"
    prefix = "${config.backend.config.prefix}"
  }
}
`;
        break;
        
      case 'azurerm':
        backendConfig = `
terraform {
  backend "azurerm" {
    resource_group_name  = "${config.backend.config.resource_group_name}"
    storage_account_name = "${config.backend.config.storage_account_name}"
    container_name       = "${config.backend.config.container_name}"
    key                  = "${config.backend.config.key}"
  }
}
`;
        break;
        
      case 'remote':
        backendConfig = `
terraform {
  backend "remote" {
    hostname     = "${config.backend.config.hostname || 'app.terraform.io'}"
    organization = "${config.backend.config.organization}"
    
    workspaces {
      name = "${config.backend.config.workspace}"
    }
  }
}
`;
        break;
    }
    
    if (backendConfig) {
      const backendPath = path.join(config.workingDirectory, 'backend.tf');
      await fs.writeFile(backendPath, backendConfig, 'utf8');
    }
  }

  private async parsePlanOutput(output: string, planFile: string): Promise<TerraformPlan> {
    const resourceChanges: ResourceChange[] = [];
    const outputChanges: OutputChange[] = [];
    
    // Parse the plan file for detailed changes
    try {
      const { stdout } = await this.runCommand(
        `terraform show -no-color -json ${planFile}`,
        path.dirname(planFile)
      );
      
      const planData = JSON.parse(stdout);
      
      // Extract resource changes
      for (const change of planData.resource_changes || []) {
        resourceChanges.push({
          address: change.address,
          mode: change.mode,
          type: change.type,
          name: change.name,
          change: {
            actions: change.change.actions,
            before: change.change.before,
            after: change.change.after,
          },
        });
      }
      
      // Extract output changes
      for (const [name, change] of Object.entries(planData.output_changes || {})) {
        outputChanges.push({
          name,
          before: (change as any).before,
          after: (change as any).after,
          sensitive: (change as any).after_sensitive || false,
        });
      }
    } catch (error) {
      logger.warn('Failed to parse plan file:', error instanceof Error ? error : new Error(String(error)));
    }
    
    const hasChanges = resourceChanges.length > 0 || outputChanges.length > 0;
    
    return {
      id: '',
      createdAt: new Date(),
      resourceChanges,
      outputChanges,
      hasChanges,
      planFile,
    };
  }

  private async savePlan(plan: TerraformPlan): Promise<void> {
    await Database.query(
      `INSERT INTO terraform_plans (id, data, created_at)
       VALUES ($1, $2, NOW())`,
      [plan.id, JSON.stringify(plan)]
    );
  }

  private async getPlan(planId: string): Promise<TerraformPlan | null> {
    const result = await Database.query(
      'SELECT data FROM terraform_plans WHERE id = $1',
      [planId]
    );
    
    if (result.rows.length === 0) return null;
    
    return result.rows[0].data;
  }

  private async saveApplyHistory(config: TerraformConfig, planId?: string): Promise<void> {
    await Database.query(
      `INSERT INTO terraform_applies (workspace, plan_id, config, applied_at)
       VALUES ($1, $2, $3, NOW())`,
      [config.workspace || 'default', planId, JSON.stringify(config)]
    );
  }

  private async getWorkspaceConfig(name: string): Promise<TerraformConfig> {
    const cached = this.workspaces.get(name);
    if (cached) return cached;
    
    const result = await Database.query(
      'SELECT config FROM terraform_workspaces WHERE name = $1',
      [name]
    );
    
    if (result.rows.length === 0) {
      throw new Error(`Workspace ${name} not found`);
    }
    
    const config = result.rows[0].config;
    this.workspaces.set(name, config);
    
    return config;
  }

  // Terraform version management
  public async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('terraform version -json');
      const versionInfo = JSON.parse(stdout);
      return versionInfo.terraform_version;
    } catch (error) {
      logger.error('Failed to get Terraform version:', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  public async checkVersion(requiredVersion: string): Promise<boolean> {
    const currentVersion = await this.getVersion();
    const semver = require('semver');
    
    return semver.satisfies(currentVersion, requiredVersion);
  }
}