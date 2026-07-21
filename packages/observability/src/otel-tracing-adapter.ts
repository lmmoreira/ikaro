import {
  context,
  defaultTextMapGetter,
  defaultTextMapSetter,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { ActiveTraceContext, ITracingPort, SpanAttributeValue } from './tracing-port';

// A dedicated instance, not the ambient global `propagation` API (post-review fix, TD28 PR #184):
// NodeSDK's default global propagator is a composite of tracecontext *and* baggage
// (OTEL_PROPAGATORS default "tracecontext,baggage") — going through the global API would let
// arbitrary baggage entries ride along into the carrier and get forwarded verbatim into Pub/Sub
// message attributes and the outbox's stored payload. This adapter only ever needs to carry
// traceparent/tracestate, so it deliberately excludes baggage regardless of what's globally
// registered.
const traceContextPropagator = new W3CTraceContextPropagator();

// A ProxyTracer that resolves to whatever TracerProvider NodeSDK ends up registering — safe to
// grab once here even before bootstrapTracing()'s sdk.start() runs, same as trace.getActiveSpan()
// being safe to call anywhere regardless of SDK registration order.
const tracer = trace.getTracer('@ikaro/observability');

export class OtelTracingAdapter implements ITracingPort {
  setActiveSpanAttributes(attributes: Record<string, SpanAttributeValue>): void {
    trace.getActiveSpan()?.setAttributes(attributes);
  }

  getActiveTraceContext(): ActiveTraceContext | undefined {
    const spanContext = trace.getActiveSpan()?.spanContext();
    if (!spanContext) {
      return undefined;
    }
    return { traceId: spanContext.traceId, spanId: spanContext.spanId };
  }

  injectContext(carrier: Record<string, string>): void {
    traceContextPropagator.inject(context.active(), carrier, defaultTextMapSetter);
  }

  runWithExtractedContext<T>(carrier: Record<string, string>, fn: () => T): T {
    // Seeded from context.active(), not ROOT_CONTEXT (post-review fix, TD28 PR #184): when
    // `carrier` has nothing extractable (e.g. a message published before this feature shipped,
    // or a directly-triggered test message), extract() returns its base context unchanged — so
    // seeding from ROOT_CONTEXT would silently wipe whatever span is already active on the
    // caller (e.g. the /pubsub/push request's own span, now that it's no longer excluded from
    // tracing). Seeding from context.active() preserves it instead in that fallback case, while
    // a carrier with a valid traceparent still fully overrides it as intended.
    const extracted = traceContextPropagator.extract(
      context.active(),
      carrier,
      defaultTextMapGetter,
    );
    return context.with(extracted, fn);
  }

  startActiveSpan<T>(name: string, fn: () => T): T {
    return tracer.startActiveSpan(name, (span) => {
      const fail = (err: unknown): never => {
        span.recordException(err instanceof Error ? err : String(err));
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
        throw err;
      };

      try {
        const result = fn();
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              span.end();
              return value;
            },
            (err: unknown) => fail(err),
          ) as T;
        }
        span.end();
        return result;
      } catch (err) {
        return fail(err);
      }
    });
  }
}

// Shared default instance for every ITracingPort consumer's constructor default (BaseAppLogger,
// CorrelationMiddleware, RequestInterceptor in both apps). OtelTracingAdapter is fully stateless
// — its methods only delegate to @opentelemetry/api's own global `trace` singleton — so this is
// not a caching/perf optimisation, it's centralising *which* adapter is the default: swapping it
// is one line here instead of five `new OtelTracingAdapter()` call sites across two apps.
export const defaultTracingPort: ITracingPort = new OtelTracingAdapter();
