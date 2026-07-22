// Single source of truth for the key list — PublicEnvKey is derived from it, not declared
// independently, so adding a key here can never silently diverge from the injected payload.
const PUBLIC_ENV_KEYS = [
  'NEXT_PUBLIC_BFF_URL',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL',
] as const;

export type PublicEnvKey = (typeof PUBLIC_ENV_KEYS)[number];

declare global {
  interface Window {
    __PUBLIC_ENV__?: Record<PublicEnvKey, string>;
  }
}

// `NEXT_PUBLIC_*` reads inside client-bundled code are statically replaced by Next.js at
// `next build` time — a value missing from the build environment is baked in as undefined
// forever, regardless of what the running container's real env later provides (TD29). This
// accessor is the one place that distinction is handled: server-side it reads the container's
// live process.env; client-side it reads the value the root layout injected into the initial
// HTML (see public-env-script.tsx), which is always a real per-environment value because the
// server process — unlike the client bundle — is never frozen at build time.
export function getPublicEnv(key: PublicEnvKey): string {
  if (typeof window === 'undefined') {
    return process.env[key] ?? '';
  }
  return window.__PUBLIC_ENV__?.[key] ?? '';
}

// Server-only: builds the payload the root layout injects for client consumption.
export function getServerPublicEnv(): Record<PublicEnvKey, string> {
  return Object.fromEntries(PUBLIC_ENV_KEYS.map((key) => [key, process.env[key] ?? ''])) as Record<
    PublicEnvKey,
    string
  >;
}
