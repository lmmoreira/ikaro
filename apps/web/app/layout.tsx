import type { Metadata } from 'next';
import './globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { QueryProvider } from '@/providers/query-provider';
import { PublicEnvScript } from '@/shared/lib/runtime-env/PublicEnvScript';

export const metadata: Metadata = {
  title: 'Ikaro',
  description: 'Vertical SaaS for local service businesses',
};

// Every route today is already dynamically rendered as a side effect of next-intl's
// getLocale() reading request headers/cookies (verified via a real `next build`: every
// HTML route reports `ƒ` (dynamic) except the unrelated /robots.txt file route). That's an
// implicit, fragile guarantee — a future i18n change that no longer needs per-request
// locale detection could silently make this layout static-eligible again, which would freeze
// PublicEnvScript's env values at build time and reintroduce the exact bug TD29 exists to fix,
// with no warning. Forcing it explicitly removes the dependency on that side effect.
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="font-sans antialiased">
        <PublicEnvScript />
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryProvider>{children}</QueryProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
