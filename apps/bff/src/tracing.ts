// M17-S33 — tracing SDK bootstrap. Must be required before anything else (see package.json's
// "start"/"dev" scripts) — before NestJS initialises, before any module that might make an HTTP
// call is imported, so auto-instrumentation can patch those modules first. Shared bootstrap
// logic lives in @ikaro/observability — this file references nothing OTel-specific by name or
// shape, so a full tracer swap only ever touches that package, never this one.
import { bootstrapTracing } from '@ikaro/observability';

bootstrapTracing('ikaro-bff');
