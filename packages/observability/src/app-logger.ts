import { LoggerService, LogLevel } from '@nestjs/common';
import { LogVendorFormatter, NoopLogVendorFormatter } from './log-vendor-formatter';
import { defaultTracingPort } from './otel-tracing-adapter';
import { ITracingPort } from './tracing-port';

export interface LogContext {
  tenantId?: string;
  userId?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

type LoggerLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'VERBOSE';

type CloudSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

const LOG_LEVEL_ORDER: Record<LoggerLevel, number> = {
  VERBOSE: 5,
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};

export abstract class BaseAppLogger implements LoggerService {
  private readonly context?: string;
  private readonly vendorFormatter: LogVendorFormatter;
  private readonly tracingPort: ITracingPort;

  protected constructor(
    private readonly service: string,
    vendorFormatter: LogVendorFormatter = new NoopLogVendorFormatter(),
    context?: string,
    tracingPort: ITracingPort = defaultTracingPort,
  ) {
    this.vendorFormatter = vendorFormatter;
    this.context = context;
    this.tracingPort = tracingPort;
  }

  log(message: string, context?: LogContext | string): void {
    this.write('INFO', message, context);
  }

  warn(message: string, context?: LogContext | string): void {
    this.write('WARN', message, context);
  }

  error(message: string, trace?: string, context?: LogContext | string): void {
    this.write('ERROR', message, context, trace);
  }

  debug(message: string, context?: LogContext | string): void {
    this.write('DEBUG', message, context);
  }

  verbose(message: string, context?: LogContext | string): void {
    this.write('VERBOSE', message, context);
  }

  setLogLevels(_levels: LogLevel[]): void {
    // NestJS setLogLevels is ignored — in-process filtering is controlled by LOG_LEVEL.
  }

  /** Hook for app-specific auto-enrichment (e.g. tenant context). Default: none. */
  protected enrich(): Record<string, unknown> {
    return {};
  }

  protected formatVendorFields(
    traceId: string | null,
    spanId: string | null,
  ): Record<string, unknown> {
    return this.vendorFormatter.format(traceId, spanId);
  }

  private write(
    level: LoggerLevel,
    message: string,
    context?: LogContext | string,
    stackTrace?: string,
  ): void {
    if (!this.shouldWrite(level)) {
      return;
    }

    const ctx = typeof context === 'string' ? { context } : context;
    const activeTraceContext = this.tracingPort.getActiveTraceContext();
    const activeTraceId = activeTraceContext?.traceId ?? null;
    const activeSpanId = activeTraceContext?.spanId ?? null;
    const entry = {
      // Caller/enrichment fields spread first so they can supply extras (tenantId,
      // correlationId, ...) — but never override the core fields declared below them,
      // since later keys in an object literal always win over earlier spreads.
      ...this.enrich(),
      ...(ctx && typeof ctx === 'object' ? ctx : {}),
      ...this.formatVendorFields(activeTraceId, activeSpanId),
      timestamp: new Date().toISOString(),
      severity: this.toSeverity(level),
      level,
      service: this.service,
      context: (typeof context === 'string' ? context : undefined) ?? this.context,
      traceId: activeTraceId,
      spanId: activeSpanId,
      message,
      metadata: stackTrace ? { stack: stackTrace } : undefined,
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  private shouldWrite(level: LoggerLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.resolveLogLevel()];
  }

  private resolveLogLevel(): LoggerLevel {
    const rawLevel = process.env['LOG_LEVEL']?.toUpperCase();
    if (rawLevel && rawLevel in LOG_LEVEL_ORDER) {
      return rawLevel as LoggerLevel;
    }
    return 'INFO';
  }

  private toSeverity(level: LoggerLevel): CloudSeverity {
    switch (level) {
      case 'WARN':
        return 'WARNING';
      case 'ERROR':
        return 'ERROR';
      case 'DEBUG':
      case 'VERBOSE':
        return 'DEBUG';
      default:
        return 'INFO';
    }
  }
}
