import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { FeatureKey } from '@ikaro/types';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import {
  fetchLeadFormStatus,
  fetchTenantSettings,
} from '@/features/platform/api/tenant-settings.server';
import { resolveTenantFormatting } from '@/features/platform/model/tenant-settings';
import { getMessages, resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';
import { resolveDateFormat } from '@/shared/lib/formatting/locale-validators';
import { fetchTenantAccess } from '@/shared/lib/billing/access.server';
import { featureForPath } from '@/shared/lib/billing/feature-registry';
import { resolveSuspendedRedirect } from '@/shared/lib/billing/suspended-redirect';
import { lockedFeaturesOf } from '@/shared/lib/billing/tenant-access';

export interface DashboardShellContext {
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly tenantId: string;
  readonly userName: string | null;
  readonly role: 'STAFF' | 'MANAGER';
  readonly locale: string;
  readonly messages: Awaited<ReturnType<typeof getMessages>>;
  readonly formatting: ReturnType<typeof resolveTenantFormatting>;
  // Gates the "Leads" sidebar/bottom-nav item — a tenant that never enabled LEAD_FORM never
  // sees it, since it would otherwise point at a permanently-empty screen (M20-S10). It is the
  // manager's own choice and is false for a tenant that is not entitled to LEAD_FORM, which is
  // shown locked instead (`lockedFeatures`).
  readonly leadFormEnabled: boolean;
  // The features the tenant does not hold (UC-125): their nav items render locked. Empty when the
  // access read failed, so the dashboard renders as it did before billing (fail open).
  readonly lockedFeatures: readonly FeatureKey[];
  // The feature that owns the route being rendered, from the registry (null for an ungated one).
  readonly routeFeature: FeatureKey | null;
}

export function buildDashboardShellContext(
  payload: ReturnType<typeof decodeJwtPayload>,
): Omit<
  DashboardShellContext,
  'messages' | 'formatting' | 'leadFormEnabled' | 'lockedFeatures' | 'routeFeature'
> {
  return {
    tenantName: payload.tenantName ?? '',
    tenantSlug: payload.tenantSlug ?? '',
    tenantId: payload.tenantId ?? '',
    userName: payload.userName ?? null,
    role: payload.role === 'MANAGER' ? 'MANAGER' : 'STAFF',
    locale: resolveSupportedLocale(payload.locale ?? 'pt-BR'),
  };
}

// The access answer is read first, before the shell's own reads: a suspended tenant's denied
// reads would otherwise fail the layout before the redirect could happen (UC-121). It is one extra
// BFF call per section layout render (the backend caches it); a failed read fails open.
export async function loadDashboardShellContext(
  token: string,
  payload: ReturnType<typeof decodeJwtPayload>,
): Promise<DashboardShellContext> {
  const base = buildDashboardShellContext(payload);
  const pathname = (await headers()).get('x-pathname') ?? '';
  const accessResult = await fetchTenantAccess(token);
  const access = accessResult.ok ? accessResult.access : null;

  const suspendedTarget = resolveSuspendedRedirect({ role: base.role, access, pathname });
  if (suspendedTarget) redirect(suspendedTarget);

  const lockedFeatures = access ? lockedFeaturesOf(access) : [];
  const leadFormEntitled = !lockedFeatures.includes('LEAD_FORM');
  const [messages, tenantSettings, leadFormStatus] = await Promise.all([
    getMessages(base.locale),
    fetchTenantSettings(token),
    leadFormEntitled ? fetchLeadFormStatus(token) : Promise.resolve({ enabled: false }),
  ]);

  return {
    ...base,
    messages,
    formatting: resolveTenantFormatting(tenantSettings),
    leadFormEnabled: leadFormStatus.enabled,
    lockedFeatures,
    routeFeature: featureForPath(pathname),
  };
}

export function resolveDashboardDateFormat(
  formatting: DashboardShellContext['formatting'],
): ReturnType<typeof resolveDateFormat> {
  return resolveDateFormat(formatting.dateFormat);
}
