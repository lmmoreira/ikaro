import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { resolveDateFormat } from '@/lib/formatting/locale-validators';
import { fetchTenantSettings, resolveTenantFormatting } from '@/lib/api/dashboard/tenants';

export interface DashboardShellContext {
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly tenantId: string;
  readonly userName: string | null;
  readonly role: 'STAFF' | 'MANAGER';
  readonly locale: string;
  readonly messages: Awaited<ReturnType<typeof getMessages>>;
  readonly formatting: ReturnType<typeof resolveTenantFormatting>;
}

export function buildDashboardShellContext(
  payload: ReturnType<typeof decodeJwtPayload>,
): Omit<DashboardShellContext, 'messages' | 'formatting'> {
  return {
    tenantName: payload.tenantName ?? '',
    tenantSlug: payload.tenantSlug ?? '',
    tenantId: payload.tenantId ?? '',
    userName: payload.userName ?? null,
    role: payload.role === 'MANAGER' ? 'MANAGER' : 'STAFF',
    locale: resolveSupportedLocale(payload.locale ?? 'pt-BR'),
  };
}

export async function loadDashboardShellContext(
  token: string,
  payload: ReturnType<typeof decodeJwtPayload>,
): Promise<DashboardShellContext> {
  const base = buildDashboardShellContext(payload);
  const [messages, tenantSettings] = await Promise.all([
    getMessages(base.locale),
    fetchTenantSettings(token),
  ]);

  return {
    ...base,
    messages,
    formatting: resolveTenantFormatting(tenantSettings),
  };
}

export function resolveDashboardDateFormat(
  formatting: DashboardShellContext['formatting'],
): ReturnType<typeof resolveDateFormat> {
  return resolveDateFormat(formatting.dateFormat);
}
