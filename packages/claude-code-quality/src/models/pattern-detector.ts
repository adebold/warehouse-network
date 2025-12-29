/**
 * Pattern Detector Model
 * 
 * ML model for detecting code patterns and anti-patterns
 */

import * as tf from '@tensorflow/tfjs-node';

import { ASTNode, DetectedPattern } from '../types';
import { Logger } from '../utils/logger';

import { CodeEmbeddings } from './code-embeddings';

export class PatternDetectorModel {
  private model: tf.LayersModel | null = null;
  private embeddings: CodeEmbeddings;
  private logger: Logger;
  private patterns: Map<number, PatternDefinition>;
  private isInitialized = false;

  constructor() {
    this.logger = new Logger('PatternDetectorModel');
    this.embeddings = new CodeEmbeddings();
    this.patterns = this.initializePatterns();
  }

  /**
   * Initialize the model
   */
  async initialize() {
    if (this.isInitialized) {return;}

    try {
      // Initialize embeddings
      await this.embeddings.initialize();

      // Create or load model
      this.model = await this.createModel();
      
      this.isInitialized = true;
      this.logger.info('Pattern detector model initialized');
    } catch (error) {
      this.logger.error('Failed to initialize pattern detector', error);
      throw error;
    }
  }

  /**
   * Detect patterns in AST
   */
  async detect(ast: ASTNode): Promise<DetectedPattern[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const patterns: DetectedPattern[] = [];
    
    // Extract features from AST
    const features = await this.extractFeatures(ast);
    
    // Run prediction
    const predictions = await this.predict(features);
    
    // Convert predictions to patterns
    for (let i = 0; i < predictions.length; i++) {
      const confidence = predictions[i];
      if (confidence > 0.5) {
        const pattern = this.patterns.get(i);
        if (pattern) {
          patterns.push({
            name: pattern.name,
            type: pattern.type,
            confidence,
            occurrences: 1,
            impact: pattern.impact,
            description: pattern.description
          });
        }
      }
    }
    
    // Merge similar patterns
    return this.mergePatterns(patterns);
  }

  /**
   * Create neural network model
   */
  private async createModel(): Promise<tf.LayersModel> {
    // Try to load pre-trained model
    try {
      const modelPath = 'file://./models/pattern-detector/model.json';
      return await tf.loadLayersModel(modelPath);
    } catch (error) {
      // Create new model if not found
      this.logger.info('Creating new pattern detection model');
      
      const model = tf.sequential({
        layers: [
          tf.layers.dense({
            inputShape: [512], // Embedding size
            units: 256,
            activation: 'relu',
            kernelInitializer: 'heNormal'
          }),
          tf.layers.dropout({ rate: 0.3 }),
          tf.layers.dense({
            units: 128,
            activation: 'relu',
            kernelInitializer: 'heNormal'
          }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({
            units: 64,
            activation: 'relu',
            kernelInitializer: 'heNormal'
          }),
          tf.layers.dense({
            units: this.patterns.size,
            activation: 'sigmoid' // Multi-label classification
          })
        ]
      });
      
      model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy', 'precision', 'recall']
      });
      
      return model;
    }
  }

  /**
   * Extract features from AST
   */
  private async extractFeatures(ast: ASTNode): Promise<number[]> {
    // Get embeddings for the AST
    const embedding = await this.embeddings.encode(ast);
    
    // Add structural features
    const structuralFeatures = this.extractStructuralFeatures(ast);
    
    // Combine features
    return [...embedding, ...structuralFeatures];
  }

  /**
   * Extract structural features from AST
   */
  private extractStructuralFeatures(ast: ASTNode): number[] {
    const features: number[] = [];
    
    // Count node types
    const nodeTypeCounts = new Map<string, number>();
    this.countNodeTypes(ast, nodeTypeCounts);
    
    // Add normalized counts for common patterns
    const patternTypes = [
      'IfStatement', 'ForStatement', 'WhileStatement', 'FunctionDeclaration',
      'ClassDeclaration', 'TryStatement', 'SwitchStatement', 'ConditionalExpression'
    ];
    
    const totalNodes = Array.from(nodeTypeCounts.values()).reduce((a, b) => a + b, 0);
    
    for (const type of patternTypes) {
      const count = nodeTypeCounts.get(type) || 0;
      features.push(count / (totalNodes || 1));
    }
    
    // Add complexity metrics
    features.push(this.calculateDepth(ast) / 10);
    features.push(this.calculateBreadth(ast) / 50);
    
    return features;
  }

  /**
   * Count node types in AST
   */
  private countNodeTypes(node: ASTNode, counts: Map<string, number>) {
    const count = counts.get(node.type) || 0;
    counts.set(node.type, count + 1);
    
    if (node.children) {
      node.children.forEach(child => this.countNodeTypes(child, counts));
    }
  }

  /**
   * Calculate AST depth
   */
  private calculateDepth(node: ASTNode): number {
    if (!node.children || node.children.length === 0) {
      return 1;
    }
    
    return 1 + Math.max(...node.children.map(child => this.calculateDepth(child)));
  }

  /**
   * Calculate AST breadth
   */
  private calculateBreadth(node: ASTNode): number {
    let maxBreadth = 0;
    const queue: { node: ASTNode; level: number }[] = [{ node, level: 0 }];
    const levelCounts = new Map<number, number>();
    
    while (queue.length > 0) {
      const { node, level } = queue.shift()!;
      
      const count = (levelCounts.get(level) || 0) + 1;
      levelCounts.set(level, count);
      maxBreadth = Math.max(maxBreadth, count);
      
      if (node.children) {
        node.children.forEach(child => {
          queue.push({ node: child, level: level + 1 });
        });
      }
    }
    
    return maxBreadth;
  }

  /**
   * Run prediction
   */
  private async predict(features: number[]): Promise<number[]> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }
    
    const input = tf.tensor2d([features]);
    const prediction = this.model.predict(input) as tf.Tensor;
    const result = await prediction.array() as number[][];
    
    input.dispose();
    prediction.dispose();
    
    return result[0];
  }

  /**
   * Merge similar patterns
   */
  private mergePatterns(patterns: DetectedPattern[]): DetectedPattern[] {
    const merged = new Map<string, DetectedPattern>();
    
    for (const pattern of patterns) {
      const existing = merged.get(pattern.name);
      if (existing) {
        existing.occurrences += pattern.occurrences;
        existing.confidence = Math.max(existing.confidence, pattern.confidence);
      } else {
        merged.set(pattern.name, { ...pattern });
      }
    }
    
    return Array.from(merged.values());
  }

  /**
   * Initialize pattern definitions
   */
  private initializePatterns(): Map<number, PatternDefinition> {
    const patterns = new Map<number, PatternDefinition>();
    
    // Design patterns
    patterns.set(0, {
      name: 'Singleton Pattern',
      type: 'design-pattern',
      impact: 'positive',
      description: 'Ensures a class has only one instance'
    });
    
    patterns.set(1, {
      name: 'Factory Pattern',
      type: 'design-pattern',
      impact: 'positive',
      description: 'Creates objects without specifying exact classes'
    });
    
    patterns.set(2, {
      name: 'Observer Pattern',
      type: 'design-pattern',
      impact: 'positive',
      description: 'Defines one-to-many dependency between objects'
    });
    
    // Anti-patterns
    patterns.set(3, {
      name: 'God Class',
      type: 'anti-pattern',
      impact: 'negative',
      description: 'Class that knows too much or does too much'
    });
    
    patterns.set(4, {
      name: 'Spaghetti Code',
      type: 'anti-pattern',
      impact: 'negative',
      description: 'Code with complex and tangled control structure'
    });
    
    patterns.set(5, {
      name: 'Copy-Paste Programming',
      type: 'anti-pattern',
      impact: 'negative',
      description: 'Duplicated code instead of abstraction'
    });
    
    // Code smells
    patterns.set(6, {
      name: 'Long Method',
      type: 'code-smell',
      impact: 'negative',
      description: 'Method that is too long and does too much'
    });
    
    patterns.set(7, {
      name: 'Large Class',
      type: 'code-smell',
      impact: 'negative',
      description: 'Class with too many responsibilities'
    });
    
    patterns.set(8, {
      name: 'Feature Envy',
      type: 'code-smell',
      impact: 'negative',
      description: 'Method that uses more features of another class'
    });
    
    return patterns;
  }

  /**
   * Train the model with new data
   */
  async train(trainingData: TrainingExample[]): Promise<void> {
    if (!this.model) {
      throw new Error('Model not initialized');
    }
    
    // Prepare training data
    const features: number[][] = [];
    const labels: number[][] = [];
    
    for (const example of trainingData) {
      const featureVector = await this.extractFeatures(example.ast);
      features.push(featureVector);
      labels.push(example.patterns);
    }
    
    const xs = tf.tensor2d(features);
    const ys = tf.tensor2d(labels);
    
    // Train model
    await this.model.fit(xs, ys, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          this.logger.debug(`Epoch ${epoch}: loss = ${logs?.loss}`);
        }
      }
    });
    
    xs.dispose();
    ys.dispose();
  }

  /**
   * Save the model
   */
  async save(path: string = './models/pattern-detector') {
    if (!this.model) {
      throw new Error('Model not initialized');
    }
    
    await this.model.save(`file://${path}`);
    this.logger.info(`Model saved to ${path}`);
  }

  /**
   * Get model statistics
   */
  getStats() {
    if (!this.model) {
      return { initialized: false };
    }
    
    return {
      initialized: true,
      patterns: this.patterns.size,
      modelParams: this.model.countParams()
    };
  }
}

interface PatternDefinition {
  name: string;
  type: 'design-pattern' | 'anti-pattern' | 'code-smell';
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
}

interface TrainingExample {
  ast: ASTNode;
  patterns: number[]; // Binary array indicating pattern presence
}