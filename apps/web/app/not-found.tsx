import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SITE_URL } from '@/lib/hotsite/seo';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notFound');
  return { title: t('title') };
}

export default async function HotsiteNotFound() {
  const t = await getTranslations('notFound');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="mb-4 text-3xl font-bold">{t('tenantNotFound')}</h1>
      <p className="mb-8 text-gray-600">{t('tenantNotFoundDescription')}</p>
      <a href={SITE_URL} className="text-blue-600 underline">
        {t('backToHome')}
      </a>
    </main>
  );
}
