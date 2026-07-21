import { context, trace } from '@opentelemetry/api';
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

describe('OtelTracingAdapter', () => {
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;
  let adapter: OtelTracingAdapter;

  beforeAll(() => {
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
  });

  afterAll(() => {
    contextManager.disable();
    context.disable();
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
});
