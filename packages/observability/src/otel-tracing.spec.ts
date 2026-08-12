import { ROOT_CONTEXT, trace, SpanKind, TraceFlags, type SpanContext } from '@opentelemetry/api';
import { SamplingDecision } from '@opentelemetry/sdk-trace-base';
import { AggregationTemporalityPreference } from '@opentelemetry/exporter-metrics-otlp-http';
import {
  buildOtlpExporterOptions,
  buildOtlpMetricExporterOptions,
  createSampler,
  isHealthCheckPath,
} from './otel-tracing';

describe('isHealthCheckPath', () => {
  it('matches backend health-check paths (no global prefix)', () => {
    expect(isHealthCheckPath('/health/live')).toBe(true);
    expect(isHealthCheckPath('/health/ready')).toBe(true);
  });

  it('matches BFF health-check paths (global v1 prefix) — the original bug this fixes', () => {
    expect(isHealthCheckPath('/v1/health/live')).toBe(true);
    expect(isHealthCheckPath('/v1/health/ready')).toBe(true);
  });

  it('does not match a real route whose query string happens to contain a health-check-looking value — the .includes() regression this fixes', () => {
    expect(isHealthCheckPath('/v1/bookings?redirect=/health/live')).toBe(false);
    expect(
      isHealthCheckPath('/services/019f9e4e-7d01-74ad-ae3f-4bf4450b2e92?next=/v1/health/ready'),
    ).toBe(false);
  });

  it('does not match unrelated real routes', () => {
    expect(isHealthCheckPath('/staff/me/status')).toBe(false);
    expect(isHealthCheckPath('/v1/tenants/settings')).toBe(false);
    expect(isHealthCheckPath('/bookings?status=APPROVED&limit=20')).toBe(false);
  });

  it('handles undefined/empty url without throwing', () => {
    expect(isHealthCheckPath(undefined)).toBe(false);
    expect(isHealthCheckPath('')).toBe(false);
  });
});

describe('createSampler', () => {
  const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';

  function contextWithParent(overrides: Partial<SpanContext>) {
    const spanContext: SpanContext = {
      traceId,
      spanId: '00f067aa0ba902b7',
      traceFlags: TraceFlags.NONE,
      isRemote: true,
      ...overrides,
    };
    return trace.setSpanContext(ROOT_CONTEXT, spanContext);
  }

  function decide(ratio: number, context = ROOT_CONTEXT) {
    return createSampler(ratio).shouldSample(context, traceId, 'test-span', SpanKind.SERVER, {}, [])
      .decision;
  }

  it('samples a true root span (no parent context) at ratio 1.0', () => {
    expect(decide(1.0)).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it('samples a span with a remote parent marked NOT sampled, at ratio 1.0 — the regression this fixes', () => {
    // Before this fix, ParentBasedSampler's own default (AlwaysOffSampler for
    // remoteParentNotSampled) silently dropped this regardless of ratio — this is the exact
    // mechanism that lost ~75-89% of real traces in production (2026-08-05).
    const context = contextWithParent({ isRemote: true, traceFlags: TraceFlags.NONE });
    expect(decide(1.0, context)).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it('samples a span with a local parent marked NOT sampled, at ratio 1.0 — the same regression, local case', () => {
    const context = contextWithParent({ isRemote: false, traceFlags: TraceFlags.NONE });
    expect(decide(1.0, context)).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it('still respects a genuinely-sampled remote parent — distributed trace continuity is unaffected', () => {
    const context = contextWithParent({ isRemote: true, traceFlags: TraceFlags.SAMPLED });
    expect(decide(1.0, context)).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });

  it('respects ratio 0 for root spans and not-sampled parents — confirms this is ratio-driven, not AlwaysOn in disguise', () => {
    expect(decide(0)).toBe(SamplingDecision.NOT_RECORD);
    const notSampledParent = contextWithParent({ isRemote: true, traceFlags: TraceFlags.NONE });
    expect(decide(0, notSampledParent)).toBe(SamplingDecision.NOT_RECORD);
  });

  it('still respects a genuinely-sampled remote parent even at ratio 0 — remoteParentSampled is deliberately left at its AlwaysOn default, only the NotSampled cases are overridden, so an already-in-progress upstream-sampled trace is never broken mid-way', () => {
    const sampledParent = contextWithParent({ isRemote: true, traceFlags: TraceFlags.SAMPLED });
    expect(decide(0, sampledParent)).toBe(SamplingDecision.RECORD_AND_SAMPLED);
  });
});

describe('buildOtlpExporterOptions', () => {
  it('sets concurrencyLimit: 200 — cross-tool review finding on PR #326, this had no regression coverage', () => {
    expect(buildOtlpExporterOptions({}).concurrencyLimit).toBe(200);
  });

  it('falls back to the hardcoded localhost URL when neither OTEL_EXPORTER_OTLP_ENDPOINT nor the signal-specific var is set', () => {
    expect(buildOtlpExporterOptions({}).url).toBe('http://localhost:4318/v1/traces');
  });

  it('omits the hardcoded url when the generic OTEL_EXPORTER_OTLP_ENDPOINT is set — lets the exporter derive it per spec', () => {
    const options = buildOtlpExporterOptions({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
    });
    expect(options.url).toBeUndefined();
  });

  it('omits the hardcoded url when the signal-specific OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is set', () => {
    const options = buildOtlpExporterOptions({
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://collector:4318/v1/traces',
    });
    expect(options.url).toBeUndefined();
  });
});

describe('buildOtlpMetricExporterOptions', () => {
  it('sets temporalityPreference to CUMULATIVE explicitly — required by Google Managed Prometheus (M17-S55)', () => {
    expect(buildOtlpMetricExporterOptions({}).temporalityPreference).toBe(
      AggregationTemporalityPreference.CUMULATIVE,
    );
  });

  it('falls back to the hardcoded localhost URL when neither OTEL_EXPORTER_OTLP_ENDPOINT nor the signal-specific var is set', () => {
    expect(buildOtlpMetricExporterOptions({}).url).toBe('http://localhost:4318/v1/metrics');
  });

  it('omits the hardcoded url when the generic OTEL_EXPORTER_OTLP_ENDPOINT is set — lets the exporter derive it per spec', () => {
    const options = buildOtlpMetricExporterOptions({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
    });
    expect(options.url).toBeUndefined();
  });

  it('omits the hardcoded url when the signal-specific OTEL_EXPORTER_OTLP_METRICS_ENDPOINT is set', () => {
    const options = buildOtlpMetricExporterOptions({
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: 'http://collector:4318/v1/metrics',
    });
    expect(options.url).toBeUndefined();
  });
});
