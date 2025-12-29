/**
 * Code Embeddings Model
 * 
 * Generates vector embeddings for code using neural networks
 */

import * as crypto from 'crypto';

import * as tf from '@tensorflow/tfjs-node';

import { ASTNode } from '../types';
import { Logger } from '../utils/logger';

export class CodeEmbeddings {
  private encoder: tf.LayersModel | null = null;
  private tokenizer: CodeTokenizer;
  private logger: Logger;
  private embeddingSize = 512;
  private vocabularySize = 10000;
  private isInitialized = false;

  constructor() {
    this.logger = new Logger('CodeEmbeddings');
    this.tokenizer = new CodeTokenizer(this.vocabularySize);
  }

  /**
   * Initialize the embeddings model
   */
  async initialize() {
    if (this.isInitialized) {return;}

    try {
      // Load or create encoder model
      this.encoder = await this.createEncoder();
      
      // Initialize tokenizer
      await this.tokenizer.initialize();
      
      this.isInitialized = true;
      this.logger.info('Code embeddings model initialized');
    } catch (error) {
      this.logger.error('Failed to initialize embeddings', error);
      throw error;
    }
  }

  /**
   * Encode AST to vector embedding
   */
  async encode(ast: ASTNode): Promise<number[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Convert AST to token sequence
    const tokens = this.astToTokens(ast);
    
    // Pad or truncate to fixed length
    const paddedTokens = this.padSequence(tokens, 512);
    
    // Convert to tensor
    const input = tf.tensor2d([paddedTokens]);
    
    // Generate embedding
    const embedding = this.encoder!.predict(input) as tf.Tensor;
    const result = await embedding.array() as number[][];
    
    input.dispose();
    embedding.dispose();
    
    return result[0];
  }

  /**
   * Encode multiple ASTs in batch
   */
  async encodeBatch(asts: ASTNode[]): Promise<number[][]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Convert all ASTs to token sequences
    const tokenSequences = asts.map(ast => {
      const tokens = this.astToTokens(ast);
      return this.padSequence(tokens, 512);
    });
    
    // Convert to tensor
    const input = tf.tensor2d(tokenSequences);
    
    // Generate embeddings
    const embeddings = this.encoder!.predict(input) as tf.Tensor;
    const result = await embeddings.array() as number[][];
    
    input.dispose();
    embeddings.dispose();
    
    return result;
  }

  /**
   * Calculate similarity between two code snippets
   */
  async calculateSimilarity(ast1: ASTNode, ast2: ASTNode): Promise<number> {
    const [embedding1, embedding2] = await Promise.all([
      this.encode(ast1),
      this.encode(ast2)
    ]);
    
    // Calculate cosine similarity
    return this.cosineSimilarity(embedding1, embedding2);
  }

  /**
   * Create encoder model
   */
  private async createEncoder(): Promise<tf.LayersModel> {
    try {
      // Try to load pre-trained model
      const modelPath = 'file://./models/code-embeddings/encoder.json';
      return await tf.loadLayersModel(modelPath);
    } catch (error) {
      // Create new model if not found
      this.logger.info('Creating new code embeddings encoder');
      
      const input = tf.input({ shape: [512] });
      
      // Embedding layer
      let x = tf.layers.embedding({
        inputDim: this.vocabularySize,
        outputDim: 128,
        inputLength: 512
      }).apply(input) as tf.SymbolicTensor;
      
      // Convolutional layers for local patterns
      x = tf.layers.conv1d({
        filters: 128,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }).apply(x) as tf.SymbolicTensor;
      
      x = tf.layers.maxPooling1d({
        poolSize: 2
      }).apply(x) as tf.SymbolicTensor;
      
      x = tf.layers.conv1d({
        filters: 256,
        kernelSize: 3,
        activation: 'relu',
        padding: 'same'
      }).apply(x) as tf.SymbolicTensor;
      
      x = tf.layers.globalMaxPooling1d({}).apply(x) as tf.SymbolicTensor;
      
      // Dense layers
      x = tf.layers.dense({
        units: 512,
        activation: 'relu'
      }).apply(x) as tf.SymbolicTensor;
      
      x = tf.layers.dropout({ rate: 0.3 }).apply(x) as tf.SymbolicTensor;
      
      const output = tf.layers.dense({
        units: this.embeddingSize,
        activation: 'tanh'
      }).apply(x) as tf.SymbolicTensor;
      
      const model = tf.model({ inputs: input, outputs: output });
      
      model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError'
      });
      
      return model;
    }
  }

  /**
   * Convert AST to token sequence
   */
  private astToTokens(ast: ASTNode): number[] {
    const tokens: number[] = [];
    
    const traverse = (node: ASTNode) => {
      // Add node type token
      tokens.push(this.tokenizer.getToken(node.type));
      
      // Add special tokens for certain node types
      if (node.name) {
        tokens.push(this.tokenizer.getToken(`NAME:${node.name}`));
      }
      
      if (node.operator) {
        tokens.push(this.tokenizer.getToken(`OP:${node.operator}`));
      }
      
      if (node.value !== undefined) {
        tokens.push(this.tokenizer.getToken(`VAL:${typeof node.value}`));
      }
      
      // Traverse children
      if (node.children) {
        tokens.push(this.tokenizer.getToken('CHILDREN_START'));
        node.children.forEach(traverse);
        tokens.push(this.tokenizer.getToken('CHILDREN_END'));
      }
    };
    
    traverse(ast);
    return tokens;
  }

  /**
   * Pad or truncate sequence to fixed length
   */
  private padSequence(tokens: number[], length: number): number[] {
    if (tokens.length >= length) {
      return tokens.slice(0, length);
    }
    
    const padded = new Array(length).fill(0);
    tokens.forEach((token, i) => {
      padded[i] = token;
    });
    
    return padded;
  }

  /**
   * Calculate cosine similarity between vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    if (norm1 === 0 || norm2 === 0) {return 0;}
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Find similar code patterns
   */
  async findSimilar(
    targetAst: ASTNode, 
    candidateAsts: ASTNode[], 
    threshold: number = 0.8
  ): Promise<{ ast: ASTNode; similarity: number }[]> {
    const targetEmbedding = await this.encode(targetAst);
    const candidateEmbeddings = await this.encodeBatch(candidateAsts);
    
    const similarities = candidateEmbeddings.map((embedding, i) => ({
      ast: candidateAsts[i],
      similarity: this.cosineSimilarity(targetEmbedding, embedding)
    }));
    
    return similarities
      .filter(s => s.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Cluster code snippets by similarity
   */
  async cluster(asts: ASTNode[], numClusters: number = 5): Promise<Map<number, ASTNode[]>> {
    const embeddings = await this.encodeBatch(asts);
    
    // Simple k-means clustering
    const clusters = new Map<number, ASTNode[]>();
    const centroids = this.initializeCentroids(embeddings, numClusters);
    
    // Iterate until convergence
    for (let iter = 0; iter < 50; iter++) {
      // Clear clusters
      for (let i = 0; i < numClusters; i++) {
        clusters.set(i, []);
      }
      
      // Assign points to nearest centroid
      embeddings.forEach((embedding, idx) => {
        const nearestCluster = this.findNearestCentroid(embedding, centroids);
        clusters.get(nearestCluster)!.push(asts[idx]);
      });
      
      // Update centroids
      const newCentroids = this.updateCentroids(embeddings, clusters, asts);
      
      // Check convergence
      if (this.centroidsConverged(centroids, newCentroids)) {
        break;
      }
      
      centroids.splice(0, centroids.length, ...newCentroids);
    }
    
    return clusters;
  }

  /**
   * Initialize centroids for k-means
   */
  private initializeCentroids(embeddings: number[][], k: number): number[][] {
    const centroids: number[][] = [];
    const indices = new Set<number>();
    
    // Random initialization
    while (centroids.length < k && centroids.length < embeddings.length) {
      const idx = Math.floor(Math.random() * embeddings.length);
      if (!indices.has(idx)) {
        indices.add(idx);
        centroids.push([...embeddings[idx]]);
      }
    }
    
    return centroids;
  }

  /**
   * Find nearest centroid for embedding
   */
  private findNearestCentroid(embedding: number[], centroids: number[][]): number {
    let minDistance = Infinity;
    let nearestIdx = 0;
    
    centroids.forEach((centroid, idx) => {
      const distance = this.euclideanDistance(embedding, centroid);
      if (distance < minDistance) {
        minDistance = distance;
        nearestIdx = idx;
      }
    });
    
    return nearestIdx;
  }

  /**
   * Calculate Euclidean distance
   */
  private euclideanDistance(vec1: number[], vec2: number[]): number {
    let sum = 0;
    for (let i = 0; i < vec1.length; i++) {
      sum += Math.pow(vec1[i] - vec2[i], 2);
    }
    return Math.sqrt(sum);
  }

  /**
   * Update centroids based on cluster assignments
   */
  private updateCentroids(
    embeddings: number[][],
    clusters: Map<number, ASTNode[]>,
    asts: ASTNode[]
  ): number[][] {
    const newCentroids: number[][] = [];
    
    for (let i = 0; i < clusters.size; i++) {
      const clusterAsts = clusters.get(i) || [];
      if (clusterAsts.length === 0) {
        // Keep old centroid if cluster is empty
        newCentroids.push(new Array(this.embeddingSize).fill(0));
        continue;
      }
      
      // Calculate mean of cluster embeddings
      const clusterEmbeddings = clusterAsts.map(ast => {
        const idx = asts.indexOf(ast);
        return embeddings[idx];
      });
      
      const mean = new Array(this.embeddingSize).fill(0);
      clusterEmbeddings.forEach(embedding => {
        embedding.forEach((val, idx) => {
          mean[idx] += val / clusterEmbeddings.length;
        });
      });
      
      newCentroids.push(mean);
    }
    
    return newCentroids;
  }

  /**
   * Check if centroids have converged
   */
  private centroidsConverged(old: number[][], new_: number[][]): boolean {
    const threshold = 0.001;
    
    for (let i = 0; i < old.length; i++) {
      const distance = this.euclideanDistance(old[i], new_[i]);
      if (distance > threshold) {
        return false;
      }
    }
    
    return true;
  }
}

/**
 * Simple tokenizer for code elements
 */
class CodeTokenizer {
  private vocabulary: Map<string, number>;
  private reverseVocabulary: Map<number, string>;
  private nextId: number;
  private maxVocabulary: number;

  constructor(maxVocabulary: number) {
    this.vocabulary = new Map();
    this.reverseVocabulary = new Map();
    this.nextId = 1; // 0 is reserved for padding
    this.maxVocabulary = maxVocabulary;
  }

  async initialize() {
    // Add common AST node types
    const commonTypes = [
      'Program', 'FunctionDeclaration', 'VariableDeclaration',
      'IfStatement', 'ForStatement', 'WhileStatement',
      'ReturnStatement', 'CallExpression', 'MemberExpression',
      'Identifier', 'Literal', 'BinaryExpression',
      'CHILDREN_START', 'CHILDREN_END'
    ];
    
    commonTypes.forEach(type => this.addToken(type));
  }

  getToken(text: string): number {
    if (this.vocabulary.has(text)) {
      return this.vocabulary.get(text)!;
    }
    
    // Hash unknown tokens to fit in vocabulary
    const hash = this.hashString(text);
    return 1 + (hash % (this.maxVocabulary - 1));
  }

  private addToken(text: string): number {
    if (this.vocabulary.has(text)) {
      return this.vocabulary.get(text)!;
    }
    
    if (this.nextId >= this.maxVocabulary) {
      // Vocabulary full, use hashing
      return this.getToken(text);
    }
    
    this.vocabulary.set(text, this.nextId);
    this.reverseVocabulary.set(this.nextId, text);
    return this.nextId++;
  }

  private hashString(text: string): number {
    const hash = crypto.createHash('md5').update(text).digest();
    return hash.readUInt32BE(0);
  }
}