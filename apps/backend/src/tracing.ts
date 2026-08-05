// M17-S33 — tracing SDK bootstrap. Must be required before anything else (see package.json's
// "start"/"dev" scripts) — before NestJS initialises, before any module that might make an
// HTTP/DB call is imported, so auto-instrumentation can patch those modules first. Shared
// bootstrap logic lives in @ikaro/observability (identical for backend + bff except the
// `postgres` option) — this file references nothing OTel-specific by name or shape, so a full
// tracer swap only ever touches that package, never this one.
import { config } from 'dotenv';
import { bootstrapTracing } from '@ikaro/observability';

// Security-review follow-up (2026-07-21): this file is preloaded via `-r` before src/main.ts,
// which is what makes it run early enough to patch modules before they're imported — but that
// same early timing means NestJS's ConfigModule (which loads .env) hasn't run yet. Without this,
// OTEL_EXPORTER_OTLP_ENDPOINT/SERVICE_NAME/OTEL_SDK_DISABLED from .env are invisible here in
// local dev. Corrected (2026-08-04, M17-S34 follow-up): staging/production are unaffected, but
// NOT because Cloud Run sets these directly as container env vars — Terraform sets none of the
// three. Each has its own fallback in otel-tracing.ts/here that happens to already be correct in
// Cloud Run: OTEL_EXPORTER_OTLP_ENDPOINT falls back to the hardcoded http://localhost:4318/v1/traces
// (correct — the M17-S34 collector sidecar shares this instance's network namespace),
// SERVICE_NAME falls back to the literal passed to bootstrapTracing() below, and
// OTEL_SDK_DISABLED falls back to an APP_ENV check (APP_ENV IS Terraform-set, unlike the other
// two). Same pattern as data-source.ts/seed.ts.
config({ quiet: true });

bootstrapTracing('ikaro-backend', { postgres: true });
