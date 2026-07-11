import { Injectable, LoggerService, LogLevel } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

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
  DEBUG: 10,
  VERBOSE: 15,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
};

@Injectable()
export abstract class BaseAppLogger implements LoggerService {
  private readonly context?: string;

  protected constructor(
    private readonly service: string,
    context?: string,
  ) {
    this.context = context;
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
    // Log level filtering delegated to log aggregator (Loki)
  }

  /** Hook for app-specific auto-enrichment (e.g. tenant context). Default: none. */
  protected enrich(): Record<string, unknown> {
    return {};
  }

  protected formatVendorFields(
    _traceId: string | null,
    _spanId: string | null,
  ): Record<string, unknown> {
    return {};
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
    const spanContext = trace.getActiveSpan()?.spanContext();
    const activeTraceId = spanContext?.traceId ?? null;
    const activeSpanId = spanContext?.spanId ?? null;
    const entry = {
      // Caller/enrichment fields spread first so they can supply extras (tenantId,
      // correlationId, ...) — but never override the core fields declared below them,
      // since later keys in an object literal always win over earlier spreads.
      ...this.enrich(),
      ...(ctx && typeof ctx === 'object' ? ctx : {}),
      timestamp: new Date().toISOString(),
      severity: this.toSeverity(level),
      level,
      service: this.service,
      context: (typeof context === 'string' ? context : undefined) ?? this.context,
      traceId: activeTraceId,
      spanId: activeSpanId,
      message,
      metadata: stackTrace ? { stack: stackTrace } : undefined,
      ...this.formatVendorFields(activeTraceId, activeSpanId),
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
