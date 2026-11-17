import { redirect } from 'next/navigation';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { getAccessToken } from '@/features/auth/get-access-token';
import { ManagerSuspendedNotice } from '@/features/billing/components/ManagerSuspendedNotice';
import { StaffSuspendedNotice } from '@/features/billing/components/StaffSuspendedNotice';
import { LocaleProvider } from '@/providers/locale-provider';
import { fetchTenantAccess } from '@/shared/lib/billing/access.server';
import { resolveSuspendedPageRedirect } from '@/shared/lib/billing/suspended-redirect';
import { getMessages, resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';

// Outside the sectioned shell on purpose: no `loadDashboardShellContext`, so no denied settings
// read for a suspended tenant and no redirect loop (UC-121). The page branches on the role: a
// manager gets the manager notice (M25-S29), a staff member the staff notice (M25-S31a).
export default async function SuspendedPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const role = payload.role === 'MANAGER' ? 'MANAGER' : 'STAFF';
  const result = await fetchTenantAccess(token);

  const target = resolveSuspendedPageRedirect({ access: result.ok ? result.access : null });
  if (target) redirect(target);

  // The root provider resolves the locale from the URL, which has no tenant here, so the tenant
  // locale from the JWT is applied explicitly, as every protected layout does.
  const locale = resolveSupportedLocale(payload.locale ?? 'pt-BR');
  const messages = await getMessages(locale);

  return (
    <LocaleProvider locale={locale} messages={messages}>
      {role === 'MANAGER' ? (
        <ManagerSuspendedNotice tenantSlug={payload.tenantSlug ?? ''} />
      ) : (
        <StaffSuspendedNotice tenantSlug={payload.tenantSlug ?? ''} />
      )}
    </LocaleProvider>
  );
}
