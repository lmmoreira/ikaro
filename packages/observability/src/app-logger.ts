import { Injectable, LoggerService, LogLevel } from '@nestjs/common';

export interface LogContext {
  tenantId?: string;
  userId?: string;
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

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

  private write(
    level: string,
    message: string,
    context?: LogContext | string,
    trace?: string,
  ): void {
    const ctx = typeof context === 'string' ? { context } : context;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      context: (typeof context === 'string' ? context : undefined) ?? this.context,
      message,
      ...this.enrich(),
      ...(ctx && typeof ctx === 'object' ? ctx : {}),
      ...(trace ? { trace } : {}),
    };
    process.stdout.write(JSON.stringify(entry) + '\n');
  }
}
