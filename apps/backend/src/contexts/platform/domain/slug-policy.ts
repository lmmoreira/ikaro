import type { SlugInvalidReason } from '@ikaro/types';

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 30;

/** Injection token for the `SlugPolicy` built once with the platform owner's slug (M26-S22). */
export const SLUG_POLICY = Symbol('SlugPolicy');

/**
 * Words no tenant may register (UC-128). Three classes, locked at M26-S22 discovery:
 * (a) every real top-level segment of `apps/web/app` (a spec in this folder fails when a new one is
 * added and not listed here), (b) platform words, (c) words that impersonate Ikaro or its support.
 * Exact match, lowercase. There is deliberately no `ikaro-` prefix rule.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // (a) web routes
  'api',
  'auth',
  'bookings',
  'dashboard',
  'select-staff-tenant',
  'switch-tenant',
  'v1',
  // (b) platform words
  'ikaro-trial',
  'www',
  'login',
  'account',
  // (c) impersonation
  'ikaro',
  'admin',
  'administrator',
  'suporte',
  'support',
  'ajuda',
  'help',
  'contato',
  'contact',
  'billing',
  'cobranca',
  'pagamento',
  'payment',
  'staff',
  'equipe',
  'root',
  'system',
  'sistema',
  'security',
  'seguranca',
  'oficial',
  'official',
  'app',
  'mail',
  'email',
  'status',
  'blog',
  'docs',
  'static',
  'assets',
  'cdn',
  'webhook',
  'webhooks',
  'internal',
  'public',
  'cron',
  'signup',
  'trial',
]);

export type SlugVerdict =
  { kind: 'valid' } | { kind: 'reserved' } | { kind: 'invalid'; reason: SlugInvalidReason };

export interface SlugPolicyOptions {
  /**
   * The operator path (UC-024) may provision the platform owner's own tenant. Required, no default:
   * a caller that forgets it gets the strict self-signup behaviour only by writing `false`.
   */
  allowOwnerSlug: boolean;
}

/**
 * Format and reserved-word rules for a tenant slug (UC-128). Pure domain: the owner slug is given at
 * construction (null when `PLATFORM_OWNER_TENANT_SLUG` is unset). Uniqueness is the repository's.
 */
export class SlugPolicy {
  constructor(private readonly ownerSlug: string | null) {}

  validate(slug: string, options: SlugPolicyOptions): SlugVerdict {
    const reason = SlugPolicy.formatReason(slug);
    if (reason) return { kind: 'invalid', reason };
    if (options.allowOwnerSlug && this.ownerSlug !== null && slug === this.ownerSlug) {
      return { kind: 'valid' };
    }
    if (RESERVED_SLUGS.has(slug) || (this.ownerSlug !== null && slug === this.ownerSlug)) {
      return { kind: 'reserved' };
    }
    return { kind: 'valid' };
  }

  private static formatReason(slug: string): SlugInvalidReason | null {
    if (!/^[a-z0-9-]*$/.test(slug)) return 'INVALID_CHARACTERS';
    if (slug.length < SLUG_MIN_LENGTH) return 'TOO_SHORT';
    if (slug.length > SLUG_MAX_LENGTH) return 'TOO_LONG';
    if (slug.startsWith('-') || slug.endsWith('-')) return 'INVALID_HYPHEN';
    return null;
  }
}
