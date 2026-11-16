import { redirect } from 'next/navigation';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { getAccessToken } from '@/features/auth/get-access-token';
import { ManagerSuspendedNotice } from '@/features/billing/components/ManagerSuspendedNotice';
import { LocaleProvider } from '@/providers/locale-provider';
import { fetchTenantAccess } from '@/shared/lib/billing/access.server';
import { resolveSuspendedPageRedirect } from '@/shared/lib/billing/suspended-redirect';
import { getMessages, resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';

// Outside the sectioned shell on purpose: no `loadDashboardShellContext`, so no denied settings
// read for a suspended tenant and no redirect loop (UC-121). M25-S29 renders the manager notice;
// M25-S31a adds the staff branch here.
export default async function SuspendedPage(): Promise<React.JSX.Element> {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const role = payload.role === 'MANAGER' ? 'MANAGER' : 'STAFF';
  const result = await fetchTenantAccess(token);

  const target = resolveSuspendedPageRedirect({
    role,
    access: result.ok ? result.access : null,
  });
  if (target) redirect(target);

  // The root provider resolves the locale from the URL, which has no tenant here, so the tenant
  // locale from the JWT is applied explicitly, as every protected layout does.
  const locale = resolveSupportedLocale(payload.locale ?? 'pt-BR');
  const messages = await getMessages(locale);

  return (
    <LocaleProvider locale={locale} messages={messages}>
      <ManagerSuspendedNotice tenantSlug={payload.tenantSlug ?? ''} />
    </LocaleProvider>
  );
}
