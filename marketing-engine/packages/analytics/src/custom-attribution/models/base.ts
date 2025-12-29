/**
 * Base attribution model interface and implementations
 */

import { AttributionTouchpoint, AttributionModel, AttributionResult } from '../../core/types';

export abstract class BaseAttributionModel {
  protected model: AttributionModel;

  constructor(model: AttributionModel) {
    this.model = model;
  }

  /**
   * Calculate attribution credits for touchpoints
   */
  abstract calculate(
    touchpoints: AttributionTouchpoint[],
    conversionValue: number
  ): AttributionResult;

  /**
   * Filter touchpoints within lookback window
   */
  protected filterTouchpoints(
    touchpoints: AttributionTouchpoint[],
    conversionTime: Date
  ): AttributionTouchpoint[] {
    const lookbackMs = this.model.lookbackWindow * 24 * 60 * 60 * 1000;
    const cutoffTime = new Date(conversionTime.getTime() - lookbackMs);

    return touchpoints
      .filter(tp => tp.timestamp >= cutoffTime && tp.timestamp <= conversionTime)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Normalize credits to sum to 1
   */
  protected normalizeCredits(touchpoints: AttributionTouchpoint[]): void {
    const totalCredit = touchpoints.reduce((sum, tp) => sum + (tp.credit || 0), 0);
    
    if (totalCredit > 0) {
      touchpoints.forEach(tp => {
        tp.credit = (tp.credit || 0) / totalCredit;
      });
    }
  }

  /**
   * Create attribution result
   */
  protected createResult(
    conversionId: string,
    conversionValue: number,
    touchpoints: AttributionTouchpoint[]
  ): AttributionResult {
    return {
      conversionId,
      conversionValue,
      touchpoints,
      model: this.model,
      calculatedAt: new Date()
    };
  }
}

/**
 * First-touch attribution model
 */
export class FirstTouchModel extends BaseAttributionModel {
  calculate(
    touchpoints: AttributionTouchpoint[],
    conversionValue: number
  ): AttributionResult {
    const filteredTouchpoints = this.filterTouchpoints(
      touchpoints,
      new Date()
    );

    if (filteredTouchpoints.length > 0) {
      filteredTouchpoints[0].credit = 1;
    }

    return this.createResult(
      `conv_${Date.now()}`,
      conversionValue,
      filteredTouchpoints
    );
  }
}

/**
 * Last-touch attribution model
 */
export class LastTouchModel extends BaseAttributionModel {
  calculate(
    touchpoints: AttributionTouchpoint[],
    conversionValue: number
  ): AttributionResult {
    const filteredTouchpoints = this.filterTouchpoints(
      touchpoints,
      new Date()
    );

    if (filteredTouchpoints.length > 0) {
      filteredTouchpoints[filteredTouchpoints.length - 1].credit = 1;
    }

    return this.createResult(
      `conv_${Date.now()}`,
      conversionValue,
      filteredTouchpoints
    );
  }
}

/**
 * Linear attribution model
 */
export class LinearModel extends BaseAttributionModel {
  calculate(
    touchpoints: AttributionTouchpoint[],
    conversionValue: number
  ): AttributionResult {
    const filteredTouchpoints = this.filterTouchpoints(
      touchpoints,
      new Date()
    );

    if (filteredTouchpoints.length > 0) {
      const credit = 1 / filteredTouchpoints.length;
      filteredTouchpoints.forEach(tp => {
        tp.credit = credit;
      });
    }

    return this.createResult(
      `conv_${Date.now()}`,
      conversionValue,
      filteredTouchpoints
    );
  }
}

/**
 * Time-decay attribution model
 */
export class TimeDecayModel extends BaseAttributionModel {
  private halfLife: number = 7; // days

  calculate(
    touchpoints: AttributionTouchpoint[],
    conversionValue: number
  ): AttributionResult {
    const filteredTouchpoints = this.filterTouchpoints(
      touchpoints,
      new Date()
    );

    if (filteredTouchpoints.length > 0) {
      const conversionTime = new Date();
      
      // Calculate credits based on time decay
      filteredTouchpoints.forEach(tp => {
        const daysSinceTouch = 
          (conversionTime.getTime() - tp.timestamp.getTime()) / 
          (1000 * 60 * 60 * 24);
        
        // Exponential decay formula
        tp.credit = Math.pow(2, -daysSinceTouch / this.halfLife);
      });

      this.normalizeCredits(filteredTouchpoints);
    }

    return this.createResult(
      `conv_${Date.now()}`,
      conversionValue,
      filteredTouchpoints
    );
  }
}

/**
 * Position-based attribution model (U-shaped)
 */
export class PositionBasedModel extends BaseAttributionModel {
  private firstTouchWeight: number = 0.4;
  private lastTouchWeight: number = 0.4;
  private middleTouchWeight: number = 0.2;

  calculate(
    touchpoints: AttributionTouchpoint[],
    conversionValue: number
  ): AttributionResult {
    const filteredTouchpoints = this.filterTouchpoints(
      touchpoints,
      new Date()
    );

    if (filteredTouchpoints.length === 0) {
      return this.createResult(`conv_${Date.now()}`, conversionValue, []);
    }

    if (filteredTouchpoints.length === 1) {
      filteredTouchpoints[0].credit = 1;
    } else if (filteredTouchpoints.length === 2) {
      filteredTouchpoints[0].credit = this.firstTouchWeight / (this.firstTouchWeight + this.lastTouchWeight);
      filteredTouchpoints[1].credit = this.lastTouchWeight / (this.firstTouchWeight + this.lastTouchWeight);
    } else {
      // First touch
      filteredTouchpoints[0].credit = this.firstTouchWeight;
      
      // Last touch
      filteredTouchpoints[filteredTouchpoints.length - 1].credit = this.lastTouchWeight;
      
      // Middle touches share remaining credit
      const middleCount = filteredTouchpoints.length - 2;
      const middleCredit = this.middleTouchWeight / middleCount;
      
      for (let i = 1; i < filteredTouchpoints.length - 1; i++) {
        filteredTouchpoints[i].credit = middleCredit;
      }
    }

    return this.createResult(
      `conv_${Date.now()}`,
      conversionValue,
      filteredTouchpoints
    );
  }
}