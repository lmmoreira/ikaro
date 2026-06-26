import { cookies } from 'next/headers';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { LocaleProvider } from '@/providers/locale-provider';
import { CustomerShell } from '@/components/customer/CustomerShell';

interface MyAccountLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function MyAccountLayout({
  children,
  params,
}: MyAccountLayoutProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const payload = decodeJwtPayload(token);

  // Middleware already rejects non-CUSTOMER tokens and slug mismatches before this layout runs.
  const tenantName = payload.tenantName ?? '';
  const tenantSlug = payload.tenantSlug ?? slug;
  const userName = payload.userName ?? null;

  const locale = resolveSupportedLocale(payload.locale ?? 'pt-BR');
  const messages = await getMessages(locale);

  return (
    <LocaleProvider locale={locale} messages={messages}>
      <CustomerShell tenantName={tenantName} tenantSlug={tenantSlug} userName={userName}>
        {children}
      </CustomerShell>
    </LocaleProvider>
  );
}
