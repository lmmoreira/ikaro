import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncHooksContextManager } from '@opentelemetry/context-async-hooks';
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

// Module-level, registered globally exactly once in beforeAll below — not recreated per test.
// @opentelemetry/api's setGlobalTracerProvider() only takes effect on its first call per process
// (confirmed: even calling trace.disable() first doesn't allow a later call to take effect), so a
// fresh per-test provider/registration (the pattern every other test here doesn't need) silently
// no-ops from the second test onward. startActiveSpan() (TD28) is the one method that goes through
// the module-level tracer obtained via the global trace.getTracer(...) API, unlike every other
// method here which only reads context/active-span state directly — a single provider registered
// once, reset via exporter.reset() between tests, covers it.
const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

describe('OtelTracingAdapter', () => {
  let adapter: OtelTracingAdapter;

  beforeAll(() => {
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    trace.setGlobalTracerProvider(provider);
  });

  afterAll(async () => {
    contextManager.disable();
    context.disable();
    await provider.shutdown();
  });

  beforeEach(() => {
    exporter.reset();
    adapter = new OtelTracingAdapter();
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

    it('never injects baggage into the carrier, even when baggage is present on the active context', () => {
      const tracer = provider.getTracer('test');
      const span = tracer.startSpan('test-span');
      const carrier: Record<string, string> = {};
      const baggage = propagation.createBaggage({ 'user.id': { value: 'user-1' } });

      let ctx = trace.setSpan(context.active(), span);
      ctx = propagation.setBaggage(ctx, baggage);

      context.with(ctx, () => {
        adapter.injectContext(carrier);
      });
      span.end();

      expect(carrier['traceparent']).toEqual(expect.any(String));
      expect(carrier['baggage']).toBeUndefined();
    });

    it('preserves the currently active span when the carrier has nothing extractable', () => {
      const tracer = provider.getTracer('test');
      const activeSpan = tracer.startSpan('already-active-span');

      let childSpanId: string | undefined;
      context.with(trace.setSpan(context.active(), activeSpan), () => {
        adapter.runWithExtractedContext({}, () => {
          const childSpan = tracer.startSpan('handler-with-no-carrier-data');
          childSpanId = childSpan.spanContext().spanId;
          childSpan.end();
        });
      });
      activeSpan.end();

      const exported = exporter.getFinishedSpans();
      const parent = exported.find((s) => s.name === 'already-active-span');
      const child = exported.find((s) => s.name === 'handler-with-no-carrier-data');

      expect(parent).toBeDefined();
      expect(child).toBeDefined();
      expect(childSpanId).toBe(child?.spanContext().spanId);
      expect(child?.parentSpanContext?.spanId).toBe(parent?.spanContext().spanId);
    });
  });

  describe('startActiveSpan()', () => {
    it('starts a named span, ends it, and returns the sync result', () => {
      const returned = adapter.startActiveSpan('pubsub.event.Test', () => 'result');

      expect(returned).toBe('result');
      const [exported] = exporter.getFinishedSpans();
      expect(exported.name).toBe('pubsub.event.Test');
      expect(exported.status.code).toBe(0); // SpanStatusCode.UNSET — no error occurred
    });

    it('starts a named span, ends it, and resolves the async result', async () => {
      const returned = await adapter.startActiveSpan('pubsub.event.Test', () =>
        Promise.resolve('async-result'),
      );

      expect(returned).toBe('async-result');
      const [exported] = exporter.getFinishedSpans();
      expect(exported.name).toBe('pubsub.event.Test');
    });

    it('makes the started span active for the duration of fn, so a child span links to it', () => {
      adapter.startActiveSpan('pubsub.event.Test', () => {
        const tracer = provider.getTracer('test');
        const child = tracer.startSpan('nested-handler-work');
        child.end();
      });

      const exported = exporter.getFinishedSpans();
      const parentSpan = exported.find((s) => s.name === 'pubsub.event.Test');
      const childSpan = exported.find((s) => s.name === 'nested-handler-work');
      expect(childSpan).toBeDefined();
      expect(childSpan?.parentSpanContext?.spanId).toBe(parentSpan?.spanContext().spanId);
    });

    it('records the exception, marks the span as an error, ends it, and rethrows when fn throws synchronously', () => {
      const err = new Error('sync boom');

      expect(() =>
        adapter.startActiveSpan('pubsub.event.Test', () => {
          throw err;
        }),
      ).toThrow(err);

      const [exported] = exporter.getFinishedSpans();
      expect(exported.status.code).toBe(2); // SpanStatusCode.ERROR
      expect(exported.events.some((e) => e.name === 'exception')).toBe(true);
    });

    it('records the exception, marks the span as an error, ends it, and rejects when fn returns a rejected promise', async () => {
      const err = new Error('async boom');

      await expect(
        adapter.startActiveSpan('pubsub.event.Test', () => Promise.reject(err)),
      ).rejects.toThrow(err);

      const [exported] = exporter.getFinishedSpans();
      expect(exported.status.code).toBe(2); // SpanStatusCode.ERROR
      expect(exported.events.some((e) => e.name === 'exception')).toBe(true);
    });
  });
});
