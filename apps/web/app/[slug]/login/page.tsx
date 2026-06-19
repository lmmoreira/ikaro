import type { Metadata } from 'next';
import Image from 'next/image';
import { fetchManifest } from '@/lib/api/platform';
import { buildHotsiteMetadata } from '@/lib/hotsite/seo';

export const revalidate = 300;

interface LoginPageProps {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<{ error?: string }>;
}

export async function generateMetadata({ params }: LoginPageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  const displayName = manifest.branding.brandName ?? manifest.tenant.name;

  return {
    ...buildHotsiteMetadata({ manifest, slug, path: '/login' }),
    title: `Entrar — ${displayName}`,
    robots: { index: false, follow: false },
  };
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { slug } = await params;
  const { error } = await searchParams;
  const manifest = await fetchManifest(slug);
  const displayName = manifest.branding.brandName ?? manifest.tenant.name;
  const googleHref = `${process.env.NEXT_PUBLIC_BFF_URL}/auth/google?tenantSlug=${slug}`;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
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
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white"
            style={{ backgroundColor: 'var(--ba-primary)' }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}

        <h1 className="text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
          Entrar na {displayName}
        </h1>
        <p className="mt-2 text-sm opacity-70" style={{ color: 'var(--ba-text)' }}>
          Entre com sua conta Google para agendar
        </p>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-[var(--ba-radius)] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            Erro ao entrar. Tente novamente.
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
          Entrar com Google
        </a>

        <p className="mt-6 text-xs opacity-50" style={{ color: 'var(--ba-text)' }}>
          Ao continuar, você concorda com os termos de uso do Ikaro.
        </p>
      </div>
    </main>
  );
}
