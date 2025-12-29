/**
 * OpenTelemetry tracing configuration
 */

import { trace, context, SpanStatusCode, Span, SpanKind } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

import config from '../config/index.js';

import { logger } from './logger.js';

let sdk: NodeSDK | null = null;

export function initializeTracing(): void {
  // Temporarily disabled due to module version conflicts
  logger.info('OpenTelemetry tracing disabled');
  return;
  
  if (!config.monitoring.openTelemetry.enabled) {
    logger.info('OpenTelemetry tracing disabled');
    return;
  }

  try {
    const resource = {
      attributes: {
        [SemanticResourceAttributes.SERVICE_NAME]: config.monitoring.openTelemetry.serviceName,
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.env
      }
    } as any;

    const exporterOptions: any = {
      url: `${config.monitoring.openTelemetry.endpoint}/v1/traces`
    };
    if (config.monitoring.openTelemetry.headers) {
      exporterOptions.headers = config.monitoring.openTelemetry.headers;
    }
    const traceExporter = new OTLPTraceExporter(exporterOptions);

    sdk = new NodeSDK({
      resource,
      traceExporter: traceExporter as any,
      spanProcessor: new BatchSpanProcessor(traceExporter) as any,
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': {
            enabled: false // Disable fs instrumentation to reduce noise
          }
        })
      ]
    });

    sdk!.start();
    logger.info('OpenTelemetry tracing initialized', {
      endpoint: config.monitoring.openTelemetry.endpoint,
      service: config.monitoring.openTelemetry.serviceName
    });
  } catch (error) {
    logger.error('Failed to initialize OpenTelemetry:', error);
  }
}

export function shutdownTracing(): Promise<void> {
  if (sdk) {
    return sdk.shutdown();
  }
  return Promise.resolve();
}

// Get the tracer instance
export function getTracer(name = 'claude-agent-tracker') {
  return trace.getTracer(name, process.env.npm_package_version || '1.0.0');
}

// Helper functions for common tracing patterns
export async function traceAsync<T>(
  spanName: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, any>;
  }
): Promise<T> {
  const tracer = getTracer();
  const spanOptions: any = {
    kind: options?.kind || SpanKind.INTERNAL
  };
  if (options?.attributes) {
    spanOptions.attributes = options.attributes;
  }
  const span = tracer.startSpan(spanName, spanOptions);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

export function traceSync<T>(
  spanName: string,
  fn: (span: Span) => T,
  options?: {
    kind?: SpanKind;
    attributes?: Record<string, any>;
  }
): T {
  const tracer = getTracer();
  const spanOptions: any = {
    kind: options?.kind || SpanKind.INTERNAL
  };
  if (options?.attributes) {
    spanOptions.attributes = options.attributes;
  }
  const span = tracer.startSpan(spanName, spanOptions);

  try {
    const result = context.with(trace.setSpan(context.active(), span), () => fn(span));
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error'
    });
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

// Decorator for tracing class methods
export function Trace(spanName?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const name = spanName || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      return traceAsync(name, async (span) => {
        span.setAttribute('class', target.constructor.name);
        span.setAttribute('method', propertyKey);
        return originalMethod.apply(this, args);
      });
    };

    return descriptor;
  };
}

// Add trace context to logs
export function getTraceContext() {
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      traceFlags: spanContext.traceFlags
    };
  }
  return null;
}