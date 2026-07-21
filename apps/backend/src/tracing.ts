// M17-S33 — OpenTelemetry SDK bootstrap. Must be required before anything else (see
// package.json's "start"/"dev" scripts) — before NestJS initialises, before any module that
// might make an HTTP/DB call is imported, so auto-instrumentation can patch those modules
// first. Shared bootstrap logic lives in @ikaro/observability (identical for backend + bff
// except this app-specific pg instrumentation override) to avoid duplicating the SDK/sampler/
// exporter wiring across both apps' tracing.ts files.
import { bootstrapOtelTracing } from '@ikaro/observability';

bootstrapOtelTracing('ikaro-backend', {
  // TypeORM runs on the `pg` driver — there is no standalone OTel TypeORM instrumentation;
  // instrumenting `pg` is what actually produces DB client spans. BFF has no DB, so it omits
  // this override.
  '@opentelemetry/instrumentation-pg': { enabled: true },
});
