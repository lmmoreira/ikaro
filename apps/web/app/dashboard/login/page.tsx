import { getTranslations } from 'next-intl/server';

export default async function StaffLoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ tenantSlug?: string }>;
}) {
  const t = await getTranslations('auth');
  const bffUrl = process.env.NEXT_PUBLIC_BFF_URL;
  if (!bffUrl) throw new Error('NEXT_PUBLIC_BFF_URL is required');
  const { tenantSlug } = await searchParams;

  if (!tenantSlug) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-16 text-center">
        <div className="w-full max-w-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
            I
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t('staffHeading')}</h1>
          <p className="mt-4 text-sm text-gray-500">{t('staffLoginViaHotsite')}</p>
        </div>
      </main>
    );
  }

  const oauthUrl = `${bffUrl}/auth/google?type=staff&tenantSlug=${encodeURIComponent(tenantSlug)}`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-6 py-16 text-center">
      <div className="w-full max-w-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">
          I
        </div>

        <h1 className="text-2xl font-bold text-gray-900">{t('staffHeading')}</h1>
        <p className="mt-2 text-sm text-gray-500">{t('staffSubtitle')}</p>

        <a
          href={oauthUrl}
          className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow-sm transition-all hover:bg-gray-50"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 48 48"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"
              fill="#FFC107"
            />
            <path
              d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
              fill="#FF3D00"
            />
            <path
              d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
              fill="#4CAF50"
            />
            <path
              d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"
              fill="#1976D2"
            />
          </svg>
          {t('signInWith', { provider: 'Google' })}
        </a>

        <p className="mt-6 text-xs text-gray-400">{t('staffFirstAccess')}</p>
      </div>
    </main>
  );
}
