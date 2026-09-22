// M20-S14: Turnstile verification relocated here from the BFF (apps/bff/src/features/platform/
// turnstile.service.ts) — the BFF's ALL_TRAFFIC egress has no Cloud NAT, so its outbound call to
// Cloudflare had no route out. The backend's PRIVATE_RANGES_ONLY egress already reaches third
// parties fine (same as OPENROUTER_LLM_PROVIDER below), so this mirrors that port's shape rather
// than inventing a new one.
export const CLOUDFLARE_TURNSTILE_PROVIDER = Symbol('CloudflareTurnstileProvider');

export interface ITurnstileVerifierPort {
  /**
   * Verifies a Cloudflare Turnstile token via siteverify. Fails closed on any error — a network
   * failure, a timeout, or a missing/misconfigured secret all resolve to `false`, never throw.
   */
  verify(token: string, remoteIp: string): Promise<boolean>;
}
