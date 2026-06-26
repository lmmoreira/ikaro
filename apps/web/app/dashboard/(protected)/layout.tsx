import { cookies } from 'next/headers';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { LocaleProvider } from '@/providers/locale-provider';
import { DashboardShell } from '@/components/dashboard/DashboardShell';

interface ProtectedLayoutProps {
  readonly children: React.ReactNode;
}

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const payload = decodeJwtPayload(token);

  // Middleware already rejects non-STAFF/MANAGER tokens before this layout renders.
  const role = (payload.role === 'MANAGER' ? 'MANAGER' : 'STAFF') as 'STAFF' | 'MANAGER';
  const tenantName = payload.tenantName ?? '';
  const tenantSlug = payload.tenantSlug ?? '';
  const userName = payload.userName ?? null;

  const locale = resolveSupportedLocale(payload.locale ?? 'pt-BR');
  const messages = await getMessages(locale);

  return (
    <LocaleProvider locale={locale} messages={messages}>
      <DashboardShell
        tenantName={tenantName}
        tenantSlug={tenantSlug}
        userName={userName}
        role={role}
      >
        {children}
      </DashboardShell>
    </LocaleProvider>
  );
}
