#!/usr/bin/env node

/**
 * Claude Code Quality CLI
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

import { ReportGenerator } from '../core/reporter';
import { createAnalyzer } from '../index';
import { CodeQualityConfig } from '../types';
import { Logger } from '../utils/logger';
import { logger } from '../../../../../../utils/logger';

const program = new Command();
const logger = new Logger('CLI');

program
  .name('claude-code-quality')
  .description('AI-powered code quality analysis')
  .version('1.0.0');

program
  .command('analyze [paths...]')
  .description('Analyze code quality')
  .option('-c, --config <path>', 'Configuration file path')
  .option('-o, --output <path>', 'Output file path')
  .option('-f, --format <format>', 'Output format (json|html|markdown|terminal)', 'terminal')
  .option('--no-ai', 'Disable AI-powered analysis')
  .option('--no-security', 'Disable security scanning')
  .option('--no-performance', 'Disable performance analysis')
  .option('--threshold-complexity <n>', 'Cyclomatic complexity threshold', '10')
  .option('--threshold-cognitive <n>', 'Cognitive complexity threshold', '15')
  .action(async (paths: string[], options) => {
    const spinner = ora('Initializing analyzer...').start();
    
    try {
      // Load configuration
      const config = await loadConfig(options);
      
      // Default to current directory if no paths specified
      if (!paths || paths.length === 0) {
        paths = ['.'];
      }
      
      // Convert to absolute paths
      const absolutePaths = paths.map(p => path.resolve(p));
      
      spinner.text = 'Analyzing code quality...';
      
      // Create analyzer
      const analyzer = createAnalyzer(config);
      
      // Run analysis
      const result = await analyzer.analyze(absolutePaths);
      
      spinner.succeed('Analysis complete!');
      
      // Generate report
      const reporter = new ReportGenerator(config);
      
      if (options.output) {
        await reporter.save(result, options.output);
        logger.info(chalk.green(`Report saved to: ${options.output}`));
      } else {
        // Display in terminal
        reporter.displayTerminal(result);
      }
      
      // Exit with error code if issues found
      if (result.issues.filter(i => i.severity === 'error' || i.severity === 'critical').length > 0) {
        process.exit(1);
      }
      
    } catch (error: any) {
      spinner.fail('Analysis failed');
      logger.error(error.message);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize configuration file')
  .action(async () => {
    const configPath = path.resolve('.claude-quality.json');
    
    try {
      const defaultConfig: CodeQualityConfig = {
        enableAI: true,
        enableSecurityScan: true,
        enablePerformanceAnalysis: true,
        enableDocumentationAnalysis: true,
        enableTestAnalysis: true,
        
        thresholds: {
          complexity: {
            cyclomatic: 10,
            cognitive: 15
          },
          maintainability: 60,
          testCoverage: 80,
          documentationCoverage: 70,
          securityScore: 85,
          performanceScore: 80
        },
        
        modelConfig: {
          enabledModels: ['pattern-detection', 'security-scan', 'performance'],
          confidenceThreshold: 0.7,
          cacheResults: true,
          updateFrequency: 'batch'
        },
        
        include: ['**/*.js', '**/*.ts', '**/*.jsx', '**/*.tsx'],
        exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        
        output: {
          format: 'terminal',
          includeRecommendations: true,
          includeMetrics: true,
          verbosity: 'normal'
        }
      };
      
      await fs.writeFile(
        configPath,
        JSON.stringify(defaultConfig, null, 2)
      );
      
      logger.info(chalk.green(`Configuration file created: ${configPath}`));
    } catch (error: any) {
      logger.error(`Failed to create config: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command('train')
  .description('Train ML models with labeled data')
  .option('-d, --data <path>', 'Training data path')
  .option('-m, --model <type>', 'Model type to train')
  .action(async (options) => {
    logger.info(chalk.yellow('Training functionality coming soon...'));
  });

program
  .command('benchmark')
  .description('Run performance benchmarks')
  .action(async () => {
    logger.info(chalk.yellow('Benchmark functionality coming soon...'));
  });

/**
 * Load configuration from file or options
 */
async function loadConfig(options: any): Promise<Partial<CodeQualityConfig>> {
  let config: Partial<CodeQualityConfig> = {};
  
  // Try to load from file
  if (options.config) {
    try {
      const configPath = path.resolve(options.config);
      const content = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(content);
    } catch (error) {
      logger.warn(`Failed to load config file: ${options.config}`);
    }
  } else {
    // Try default locations
    const defaultPaths = [
      '.claude-quality.json',
      '.claude-quality.js',
      'claude-quality.config.js'
    ];
    
    for (const configPath of defaultPaths) {
      try {
        const fullPath = path.resolve(configPath);
        const content = await fs.readFile(fullPath, 'utf-8');
        config = configPath.endsWith('.js') ?
          require(fullPath) :
          JSON.parse(content);
        break;
      } catch {
        // Continue to next path
      }
    }
  }
  
  // Apply CLI options
  if (options.noAi) {config.enableAI = false;}
  if (options.noSecurity) {config.enableSecurityScan = false;}
  if (options.noPerformance) {config.enablePerformanceAnalysis = false;}
  
  if (options.thresholdComplexity) {
    config.thresholds = config.thresholds || {} as any;
    config.thresholds.complexity = config.thresholds.complexity || {} as any;
    config.thresholds.complexity.cyclomatic = parseInt(options.thresholdComplexity);
  }
  
  if (options.thresholdCognitive) {
    config.thresholds = config.thresholds || {} as any;
    config.thresholds.complexity = config.thresholds.complexity || {} as any;
    config.thresholds.complexity.cognitive = parseInt(options.thresholdCognitive);
  }
  
  if (options.format) {
    config.output = config.output || {} as any;
    config.output.format = options.format;
  }
  
  return config;
}

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}