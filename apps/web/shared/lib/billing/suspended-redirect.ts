import type { TenantAccess } from './tenant-access';

// M25 interim target: the billing page is M26's, which repoints a suspended manager to it. The
// page below this path renders the manager notice.
export const SUSPENDED_PATH = '/dashboard/suspended';

// The pages a suspended tenant's user must still reach: the login page and the notice itself, so
// the redirect cannot loop.
const REDIRECT_EXEMPT_PATHS: readonly string[] = ['/dashboard/login', SUSPENDED_PATH];

interface SuspendedRedirectInput {
  readonly role: 'STAFF' | 'MANAGER';
  // `null` is a failed or unusable access read, which fails open.
  readonly access: TenantAccess | null;
  readonly pathname: string;
}

function isExempt(pathname: string): boolean {
  return REDIRECT_EXEMPT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// Where a protected dashboard route sends a user whose tenant is suspended, or `null` for no
// redirect. M25-S29 redirects a `MANAGER` only; M25-S31a adds `STAFF` (their notice), so a
// suspended staff member is unchanged until then.
export function resolveSuspendedRedirect({
  role,
  access,
  pathname,
}: SuspendedRedirectInput): string | null {
  if (!access || access.operational) return null;
  if (role !== 'MANAGER') return null;
  if (isExempt(pathname)) return null;
  return SUSPENDED_PATH;
}

// The `/dashboard/suspended` page itself: only a manager of a suspended tenant stays on it;
// everyone else (an operational tenant, a failed read, staff until S31a) goes back to the
// dashboard entry.
export function resolveSuspendedPageRedirect({
  role,
  access,
}: Omit<SuspendedRedirectInput, 'pathname'>): string | null {
  if (role === 'MANAGER' && access && !access.operational) return null;
  return '/dashboard';
}
