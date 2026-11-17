import { redirect } from 'next/navigation';
import { getMessages, resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';
import { decodeJwtPayload } from '@/features/auth/decode-jwt';
import { getAccessToken } from '@/features/auth/get-access-token';
import { LocaleProvider } from '@/providers/locale-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import { CustomerShell } from '@/features/customer/components/CustomerShell';
import { CustomerTopbarStatusProvider } from '@/features/customer/components/customer-topbar-status-context';
import { fetchCustomerTenantOperational } from '@/shared/lib/billing/access.server';

interface MyAccountLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly slug: string }>;
}

async function resolveMyAccountContext(slug: string) {
  const token = await getAccessToken();
  const payload = decodeJwtPayload(token);
  const locale = resolveSupportedLocale(payload.locale ?? 'pt-BR');
  const messages = await getMessages(locale);
  // A fail-open read (no answer is never a suspension), shared with the page's own read in the
  // same render. It only decides whether the topbar's "+ Novo" menu is offered.
  const operational = payload.tenantId ? await fetchCustomerTenantOperational(token) : null;
  // Middleware validates tenantSlug matches the route slug before this runs — use slug directly.
  return {
    tenantName: payload.tenantName ?? '',
    tenantSlug: slug,
    tenantId: payload.tenantId ?? '',
    userName: payload.userName ?? null,
    locale,
    messages,
    tenantOperational: operational !== false,
  };
}

export default async function MyAccountLayout({
  children,
  params,
}: MyAccountLayoutProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { tenantName, tenantSlug, tenantId, userName, locale, messages, tenantOperational } =
    await resolveMyAccountContext(slug);

  if (!tenantId) redirect(`/${slug}/login`);

  return (
    <LocaleProvider locale={locale} messages={messages}>
      <TenantProvider tenantId={tenantId} tenantSlug={tenantSlug}>
        <CustomerTopbarStatusProvider>
          <CustomerShell
            tenantName={tenantName}
            tenantSlug={tenantSlug}
            userName={userName}
            tenantOperational={tenantOperational}
          >
            {children}
          </CustomerShell>
        </CustomerTopbarStatusProvider>
      </TenantProvider>
    </LocaleProvider>
  );
}
