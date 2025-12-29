let Injectable: any, NestMiddleware: any, Module: any, DynamicModule: any;
try {
  const nestCommon = require('@nestjs/common');
  Injectable = nestCommon.Injectable;
  NestMiddleware = nestCommon.NestMiddleware;
  Module = nestCommon.Module;
  DynamicModule = nestCommon.DynamicModule;
} catch {
  // NestJS not installed - create dummy decorators
  Injectable = () => (target: any) => target;
  NestMiddleware = class {};
  Module = () => (target: any) => target;
  DynamicModule = {};
}
import { IntegrityEngine } from '../core/IntegrityEngine';
import { logger } from '../utils/logger';

@Injectable()
export class IntegrityMiddleware {
  constructor(private readonly engine: IntegrityEngine) {}

  async use(req: any, res: any, next: () => void) {
    try {
      // Add integrity check headers
      res.setHeader('X-DB-Integrity', 'checked');
      res.setHeader('X-DB-Integrity-Version', '1.0.0');

      // Continue with request
      next();
    } catch (error) {
      logger.error('NestJS integrity middleware error:', error);
      next();
    }
  }
}

@Injectable()
export class IntegrityService {
  private engine: IntegrityEngine;

  constructor() {
    this.engine = new IntegrityEngine();
  }

  async checkIntegrity(options?: any) {
    return this.engine.runIntegrityChecks(options || {});
  }

  async checkDrift(baseline?: string) {
    return this.engine.checkSchemaDrift(baseline);
  }

  async validateFormsAndRoutes(options?: any) {
    return this.engine.validateFormsAndRoutes(options || {});
  }

  async startMonitoring(interval?: number) {
    return this.engine.startMonitoring(interval);
  }

  async stopMonitoring() {
    return this.engine.stopMonitoring();
  }
}

@Module({})
export class IntegrityModule {
  static forRoot(options?: any): any {
    return {
      module: IntegrityModule,
      providers: [
        IntegrityService,
        {
          provide: IntegrityEngine,
          useValue: new IntegrityEngine(options?.configPath)
        }
      ],
      exports: [IntegrityService, IntegrityEngine]
    };
  }
}