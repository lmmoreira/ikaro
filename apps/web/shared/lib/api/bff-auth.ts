// TD38: mirrors apps/bff/src/config/env.validation.ts's BACKEND_AUTH_MODE/BACKEND_AUDIENCE
// pair exactly. apps/web has no centralized zod env-validation schema (unlike BFF/backend's
// @ikaro/env-validation) -- this follows the same direct process.env-read convention already
// established by getBffUpstreamUrl() (bff-url.ts) rather than introducing a new layer.
export function getBffAuthMode(): 'none' | 'iam' {
  const mode = process.env.BFF_AUTH_MODE === 'iam' ? 'iam' : 'none';
  if (process.env.NODE_ENV === 'production' && mode !== 'iam') {
    throw new Error(
      'BFF_AUTH_MODE must be "iam" when NODE_ENV=production — both staging and prod cloud builds set NODE_ENV=production, and BFF rejects unauthenticated Cloud Run traffic in both',
    );
  }
  return mode;
}

// Optional override — defaults to BFF_UPSTREAM_URL's own origin when unset (same fallback
// BACKEND_AUDIENCE uses for BACKEND_INTERNAL_URL, backend-auth.interceptor.ts).
export function getBffAudience(): string | undefined {
  return process.env.BFF_AUDIENCE || undefined;
}
