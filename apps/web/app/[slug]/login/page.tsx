import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { fetchManifest } from '@/features/platform/api';
import { buildGoogleOAuthUrl } from '@/features/auth/google-oauth';
import { resolveHotsiteDisplayName } from '@/features/platform/hotsite/page-model';
import { buildHotsiteMetadata } from '@/features/platform/hotsite/seo';

export const revalidate = 300;

interface LoginPageProps {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<{ error?: string }>;
}

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  const displayName = resolveHotsiteDisplayName(manifest);
  const t = await getTranslations('auth');

  return {
    ...(await buildHotsiteMetadata({ manifest, slug, path: '/login' })),
    title: t('pageTitle', { name: displayName }),
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { slug } = await params;
  const { error } = await searchParams;
  const manifest = await fetchManifest(slug);
  const displayName = resolveHotsiteDisplayName(manifest);
  const googleHref = buildGoogleOAuthUrl({ tenantSlug: slug });
  const t = await getTranslations('auth');

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <div className="w-full max-w-sm">
        {manifest.branding.logoUrl ? (
          <Image
            src={manifest.branding.logoUrl}
            alt={displayName}
            width={64}
            height={64}
            className="mx-auto mb-6 h-16 w-16 object-contain"
          />
        ) : (
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold"
            style={{ backgroundColor: 'var(--ba-primary)', color: 'var(--ba-btn-text)' }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <h1 className="text-2xl font-bold">{t('heading', { name: displayName })}</h1>
        <p className="mt-2 text-sm opacity-70">{t('subtitle')}</p>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-[var(--ba-radius)] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {t('signInError')}
          </div>
        )}

        <a
          href={googleHref}
          data-testid="google-login"
          className="mt-8 inline-flex w-full items-center justify-center gap-2 border-2 px-6 py-3 font-semibold transition-all hover:opacity-90"
          style={{
            backgroundColor: 'var(--ba-btn-bg)',
            color: 'var(--ba-btn-text)',
            borderColor: 'var(--ba-btn-border)',
            borderRadius: 'var(--ba-radius)',
          }}
        >
          {t('signInWith', { provider: 'Google' })}
        </a>

        <p className="mt-6 text-xs opacity-50">{t('disclaimer')}</p>
      </div>
    </main>
  );
}
