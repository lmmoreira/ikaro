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

  /**
   * Serializes whatever trace context is currently active into `carrier` (mutated in place), so
   * it can travel somewhere W3C trace context can't reach on its own — e.g. a Pub/Sub message's
   * `attributes` map (TD28). No-ops if there is no active context.
   */
  injectContext(carrier: Record<string, string>): void;

  /**
   * Reconstructs a trace context from a previously-`injectContext`-serialized carrier and runs
   * `fn` with it active, so any span `fn` starts becomes a genuine child of the original trace
   * (TD28). Runs `fn` with no reconstructed context (i.e. unchanged) if `carrier` has nothing
   * extractable.
   */
  runWithExtractedContext<T>(carrier: Record<string, string>, fn: () => T): T;

  /**
   * Starts a new span named `name`, makes it the active span for the duration of `fn`, and ends
   * it when `fn` (sync or async) settles — recording the exception and marking the span as an
   * error if `fn` throws/rejects, then rethrowing. This is a transport-layer span for a dispatch
   * boundary that has no auto-instrumentation of its own (e.g. "this is where a Pub/Sub-delivered
   * event's processing began", TD28) — not a manual business span inside a use case, which stays
   * deferred per M17-S33/TD28's own Non-Goals.
   */
  startActiveSpan<T>(name: string, fn: () => T): T;
}
