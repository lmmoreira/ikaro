import { context, propagation, ROOT_CONTEXT, trace } from '@opentelemetry/api';
import { ActiveTraceContext, ITracingPort, SpanAttributeValue } from './tracing-port';

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
    propagation.inject(context.active(), carrier);
  }

  runWithExtractedContext<T>(carrier: Record<string, string>, fn: () => T): T {
    const extracted = propagation.extract(ROOT_CONTEXT, carrier);
    return context.with(extracted, fn);
  }
}

// Shared default instance for every ITracingPort consumer's constructor default (BaseAppLogger,
// CorrelationMiddleware, RequestInterceptor in both apps). OtelTracingAdapter is fully stateless
// — its methods only delegate to @opentelemetry/api's own global `trace` singleton — so this is
// not a caching/perf optimisation, it's centralising *which* adapter is the default: swapping it
// is one line here instead of five `new OtelTracingAdapter()` call sites across two apps.
export const defaultTracingPort: ITracingPort = new OtelTracingAdapter();
