import { cookies } from 'next/headers';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { LocaleProvider } from '@/providers/locale-provider';
import { CustomerShell } from '@/components/customer/CustomerShell';

interface MyAccountLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly slug: string }>;
}

async function resolveMyAccountContext(slug: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const payload = decodeJwtPayload(token);
  const locale = resolveSupportedLocale(payload.locale ?? 'pt-BR');
  const messages = await getMessages(locale);
  // Middleware validates tenantSlug matches the route slug before this runs — use slug directly.
  return {
    tenantName: payload.tenantName ?? '',
    tenantSlug: slug,
    userName: payload.userName ?? null,
    locale,
    messages,
  };
}

export default async function MyAccountLayout({
  children,
  params,
}: MyAccountLayoutProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const { tenantName, tenantSlug, userName, locale, messages } =
    await resolveMyAccountContext(slug);

  return (
    <LocaleProvider locale={locale} messages={messages}>
      <CustomerShell tenantName={tenantName} tenantSlug={tenantSlug} userName={userName}>
        {children}
      </CustomerShell>
    </LocaleProvider>
  );
}
