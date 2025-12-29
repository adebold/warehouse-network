/**
 * Maintainability Index Calculator
 * 
 * Calculates maintainability index based on various metrics
 */

export class MaintainabilityIndexCalculator {
  /**
   * Calculate maintainability index
   * Based on the formula from SEI (Software Engineering Institute)
   */
  calculate(halsteadVolume: number, cyclomaticComplexity: number, linesOfCode: number): number {
    // Original MI formula:
    // MI = 171 - 5.2 * ln(V) - 0.23 * CC - 16.2 * ln(LOC)
    // Where V = Halstead Volume, CC = Cyclomatic Complexity, LOC = Lines of Code
    
    // Adjusted formula with normalization to 0-100 scale
    const mi = 171 - 
      5.2 * Math.log(Math.max(1, halsteadVolume)) - 
      0.23 * cyclomaticComplexity - 
      16.2 * Math.log(Math.max(1, linesOfCode));
    
    // Normalize to 0-100 scale
    const normalized = Math.max(0, mi * 100 / 171);
    
    return Math.round(normalized * 10) / 10;
  }

  /**
   * Calculate with additional factors
   */
  calculateExtended(params: {
    halsteadVolume: number;
    cyclomaticComplexity: number;
    linesOfCode: number;
    commentRatio?: number;
    testCoverage?: number;
    couplingFactor?: number;
  }): number {
    // Base MI calculation
    let mi = this.calculate(
      params.halsteadVolume,
      params.cyclomaticComplexity,
      params.linesOfCode
    );
    
    // Adjust for comment ratio (0-1)
    if (params.commentRatio !== undefined) {
      // Good commenting improves maintainability
      mi += params.commentRatio * 10;
    }
    
    // Adjust for test coverage (0-1)
    if (params.testCoverage !== undefined) {
      // High test coverage improves maintainability
      mi += params.testCoverage * 15;
    }
    
    // Adjust for coupling factor (0-1, where lower is better)
    if (params.couplingFactor !== undefined) {
      // High coupling reduces maintainability
      mi -= params.couplingFactor * 20;
    }
    
    // Ensure result is in 0-100 range
    return Math.max(0, Math.min(100, Math.round(mi * 10) / 10));
  }

  /**
   * Get maintainability level description
   */
  getMaintainabilityLevel(index: number): {
    level: string;
    description: string;
    color: string;
  } {
    if (index >= 85) {
      return {
        level: 'Highly Maintainable',
        description: 'Code is well-structured and easy to maintain',
        color: 'green'
      };
    }
    
    if (index >= 65) {
      return {
        level: 'Moderately Maintainable',
        description: 'Code is reasonably maintainable with some areas for improvement',
        color: 'yellow'
      };
    }
    
    if (index >= 45) {
      return {
        level: 'Difficult to Maintain',
        description: 'Code has significant maintainability issues that should be addressed',
        color: 'orange'
      };
    }
    
    return {
      level: 'Very Difficult to Maintain',
      description: 'Code requires significant refactoring to improve maintainability',
      color: 'red'
    };
  }

  /**
   * Calculate maintainability for a module
   */
  calculateModuleMaintainability(metrics: {
    functions: Array<{
      halsteadVolume: number;
      cyclomaticComplexity: number;
      linesOfCode: number;
    }>;
    totalLinesOfCode: number;
    moduleComplexity: number;
  }): number {
    if (metrics.functions.length === 0) {
      return 100; // Empty module is perfectly maintainable
    }
    
    // Calculate average MI for all functions
    const functionMIs = metrics.functions.map(func => 
      this.calculate(func.halsteadVolume, func.cyclomaticComplexity, func.linesOfCode)
    );
    
    const avgFunctionMI = functionMIs.reduce((sum, mi) => sum + mi, 0) / functionMIs.length;
    
    // Adjust for module-level factors
    let moduleMI = avgFunctionMI;
    
    // Penalty for large modules
    if (metrics.totalLinesOfCode > 500) {
      moduleMI -= (metrics.totalLinesOfCode - 500) * 0.01;
    }
    
    // Penalty for high module complexity
    if (metrics.moduleComplexity > 50) {
      moduleMI -= (metrics.moduleComplexity - 50) * 0.2;
    }
    
    return Math.max(0, Math.min(100, Math.round(moduleMI * 10) / 10));
  }

  /**
   * Get recommendations based on MI
   */
  getRecommendations(index: number): string[] {
    const recommendations: string[] = [];
    
    if (index < 85) {
      recommendations.push('Consider breaking down complex functions');
    }
    
    if (index < 65) {
      recommendations.push('Reduce cyclomatic complexity by simplifying conditionals');
      recommendations.push('Extract methods to reduce function size');
    }
    
    if (index < 45) {
      recommendations.push('Major refactoring recommended');
      recommendations.push('Consider splitting into multiple modules');
      recommendations.push('Add comprehensive documentation');
      recommendations.push('Increase test coverage');
    }
    
    if (index < 25) {
      recommendations.push('Critical: Code needs complete restructuring');
      recommendations.push('Consider rewriting from scratch');
    }
    
    return recommendations;
  }

  /**
   * Calculate trend from historical data
   */
  calculateTrend(historicalData: Array<{ date: Date; index: number }>): {
    trend: 'improving' | 'stable' | 'declining';
    changeRate: number;
  } {
    if (historicalData.length < 2) {
      return { trend: 'stable', changeRate: 0 };
    }
    
    // Sort by date
    const sorted = [...historicalData].sort((a, b) => a.date.getTime() - b.date.getTime());
    
    // Calculate linear regression
    const n = sorted.length;
    const x = sorted.map((_, i) => i);
    const y = sorted.map(d => d.index);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Determine trend based on slope
    let trend: 'improving' | 'stable' | 'declining';
    if (slope > 0.5) {
      trend = 'improving';
    } else if (slope < -0.5) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }
    
    return { trend, changeRate: Math.round(slope * 100) / 100 };
  }
}