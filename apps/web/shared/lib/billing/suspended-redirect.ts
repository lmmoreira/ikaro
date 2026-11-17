import type { TenantAccess } from './tenant-access';

// M25 interim target for a manager: the billing page is M26's, which repoints a suspended manager
// to it. The page below this path renders the manager notice for a `MANAGER` and the staff notice
// for `STAFF` (M25-S31a).
export const SUSPENDED_PATH = '/dashboard/suspended';

// The pages a suspended tenant's user must still reach: the login page and the notice itself, so
// the redirect cannot loop.
const REDIRECT_EXEMPT_PATHS: readonly string[] = ['/dashboard/login', SUSPENDED_PATH];

interface SuspendedRedirectInput {
  // `null` is a failed or unusable access read, which fails open.
  readonly access: TenantAccess | null;
  readonly pathname: string;
}

function isExempt(pathname: string): boolean {
  return REDIRECT_EXEMPT_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// Where a protected dashboard route sends a user whose tenant is suspended, or `null` for no
// redirect. The answer does not depend on the role: a `MANAGER` and a `STAFF` member both land on
// `/dashboard/suspended`, which branches on the role to pick the notice (UC-121).
export function resolveSuspendedRedirect({
  access,
  pathname,
}: SuspendedRedirectInput): string | null {
  if (!access || access.operational) return null;
  if (isExempt(pathname)) return null;
  return SUSPENDED_PATH;
}

// The `/dashboard/suspended` page itself: a user of a suspended tenant stays on it; everyone else
// (an operational tenant, a failed read) goes back to the dashboard entry.
export function resolveSuspendedPageRedirect({
  access,
}: Omit<SuspendedRedirectInput, 'pathname'>): string | null {
  if (access && !access.operational) return null;
  return '/dashboard';
}
