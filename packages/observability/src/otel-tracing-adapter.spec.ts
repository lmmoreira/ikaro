import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { OtelTracingAdapter } from './otel-tracing-adapter';

// A real ContextManager must be registered for context.with()/trace.getActiveSpan() to actually
// propagate — the default NoopContextManager doesn't track "active" context at all, which is
// exactly the gap that made the earlier ad-hoc trace.getActiveSpan() call sites untestable in
// the first place. NodeSDK registers this same AsyncHooksContextManager in production.
const contextManager = new AsyncHooksContextManager();

// injectContext()/runWithExtractedContext() (TD28) delegate to propagation.inject()/extract(),
// which are no-ops under the default NoopTextMapPropagator — exactly like context.with() before
// a real ContextManager was registered above. NodeSDK registers this same W3C propagator (plus
// baggage) in production via its default OTEL_PROPAGATORS handling; nothing here is adapter- or
// test-specific.
const propagator = new W3CTraceContextPropagator();

describe('OtelTracingAdapter', () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;
  let adapter: OtelTracingAdapter;

  beforeAll(() => {
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    propagation.setGlobalPropagator(propagator);
  });

  afterAll(() => {
    contextManager.disable();
    context.disable();
    propagation.disable();
  });

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    adapter = new OtelTracingAdapter();
  });

  afterEach(async () => {
    await provider.shutdown();
  });

  it('sets attributes on the currently active span', () => {
    const tracer = provider.getTracer('test');
    const span = tracer.startSpan('test-span');

    context.with(trace.setSpan(context.active(), span), () => {
      adapter.setActiveSpanAttributes({ 'tenant.id': 'tid-1', 'user.id': 'user-1' });
    });
    span.end();

    const [exported] = exporter.getFinishedSpans();
    expect(exported.attributes['tenant.id']).toBe('tid-1');
    expect(exported.attributes['user.id']).toBe('user-1');
  });

  it('returns the active span traceId/spanId', () => {
    const tracer = provider.getTracer('test');
    const span = tracer.startSpan('test-span');
    const expectedSpanContext = span.spanContext();

    let captured: ReturnType<OtelTracingAdapter['getActiveTraceContext']>;
    context.with(trace.setSpan(context.active(), span), () => {
      captured = adapter.getActiveTraceContext();
    });
    span.end();

    expect(captured).toEqual({
      traceId: expectedSpanContext.traceId,
      spanId: expectedSpanContext.spanId,
    });
  });

  it('setActiveSpanAttributes is a no-op when there is no active span', () => {
    expect(() => adapter.setActiveSpanAttributes({ 'tenant.id': 'tid-1' })).not.toThrow();
  });

  it('getActiveTraceContext returns undefined when there is no active span', () => {
    expect(adapter.getActiveTraceContext()).toBeUndefined();
  });

  describe('injectContext() + runWithExtractedContext()', () => {
    it('links a span started inside runWithExtractedContext as a child of the span active at injectContext() time', () => {
      const tracer = provider.getTracer('test');
      const originalSpan = tracer.startSpan('original-request');
      const carrier: Record<string, string> = {};

      context.with(trace.setSpan(context.active(), originalSpan), () => {
        adapter.injectContext(carrier);
      });
      originalSpan.end();

      let childSpanId: string | undefined;
      adapter.runWithExtractedContext(carrier, () => {
        const childSpan = tracer.startSpan('consumer-handler');
        childSpanId = childSpan.spanContext().spanId;
        childSpan.end();
      });

      const exported = exporter.getFinishedSpans();
      const original = exported.find((s) => s.name === 'original-request');
      const child = exported.find((s) => s.name === 'consumer-handler');

      expect(original).toBeDefined();
      expect(child).toBeDefined();
      expect(child?.spanContext().traceId).toBe(original?.spanContext().traceId);
      expect(child?.parentSpanContext?.spanId).toBe(original?.spanContext().spanId);
      expect(childSpanId).toBe(child?.spanContext().spanId);
    });

    it('carries the serialized carrier as plain string values, ready for Pub/Sub message attributes', () => {
      const tracer = provider.getTracer('test');
      const span = tracer.startSpan('test-span');
      const carrier: Record<string, string> = {};

      context.with(trace.setSpan(context.active(), span), () => {
        adapter.injectContext(carrier);
      });
      span.end();

      expect(carrier['traceparent']).toEqual(expect.any(String));
      expect(Object.values(carrier).every((v) => typeof v === 'string')).toBe(true);
    });

    it('injectContext is a no-op (empty carrier) when there is no active span', () => {
      const carrier: Record<string, string> = {};
      adapter.injectContext(carrier);
      expect(carrier).toEqual({});
    });

    it('runWithExtractedContext runs fn with no linkage when the carrier has nothing extractable', () => {
      const tracer = provider.getTracer('test');
      let result: string | undefined;

      adapter.runWithExtractedContext({}, () => {
        const span = tracer.startSpan('unlinked-handler');
        result = span.spanContext().traceId;
        span.end();
      });

      const [exported] = exporter.getFinishedSpans();
      expect(exported.name).toBe('unlinked-handler');
      expect(exported.parentSpanContext).toBeUndefined();
      expect(result).toBe(exported.spanContext().traceId);
    });

    it('returns whatever fn returns', () => {
      const returned = adapter.runWithExtractedContext({}, () => 'handler-result');
      expect(returned).toBe('handler-result');
    });
  });
});
