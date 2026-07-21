/**
 * Whether the OTel SDK should start. `OTEL_SDK_DISABLED`, when explicitly set, always wins
 * either direction. Otherwise defaults on APP_ENV: staging/production always have the collector
 * sidecar present (M17-S34) — tracing should be on by default there, with no env var to
 * remember to flip. Local dev (and CI, which never sets APP_ENV either — both fall through to
 * the schema default 'local') has no collector unless a dev opts into `pnpm obs`, so it defaults
 * off — attempting to start there just produces failed-export WARN noise (once diag logging was
 * added, security review follow-up 2026-07-21) for a connection nothing is listening on.
 */
export function isOtelSdkDisabled(env: {
  OTEL_SDK_DISABLED?: string;
  APP_ENV?: string;
}): boolean {
  if (env.OTEL_SDK_DISABLED !== undefined) {
    return env.OTEL_SDK_DISABLED === 'true';
  }
  return (env.APP_ENV ?? 'local') === 'local';
}
