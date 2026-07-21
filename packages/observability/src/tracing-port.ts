export interface ActiveTraceContext {
  traceId: string;
  spanId: string;
}

export type SpanAttributeValue = string | number | boolean;

/**
 * Port over whatever tracing SDK is active — mirrors LogVendorFormatter's role for logging.
 * App code (middleware, interceptors, BaseAppLogger) depends on this interface only, never on
 * `@opentelemetry/api` directly, so a future tracer swap (e.g. a vendor requiring their own
 * proprietary SDK instead of OTLP ingestion) touches one new adapter class, not every call site.
 */
export interface ITracingPort {
  /** Sets attributes on whatever span is currently active. No-ops if there is none. */
  setActiveSpanAttributes(attributes: Record<string, SpanAttributeValue>): void;

  /** The currently active span's trace/span IDs, for log-line correlation. Undefined if none. */
  getActiveTraceContext(): ActiveTraceContext | undefined;
}
