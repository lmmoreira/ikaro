import type { Metadata } from 'next';
import { createTranslator } from 'next-intl';
import type { HotsiteManifestResponse } from '@ikaro/types';
import { getMessages, resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';

function stripTrailingSlashes(value: string): string {
  let result = value;
  while (result.endsWith('/')) {
    result = result.slice(0, -1);
  }
  return result;
}

export const SITE_URL = stripTrailingSlashes(
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
);

export interface BuildHotsiteMetadataParams {
  readonly manifest: HotsiteManifestResponse;
  readonly slug: string;
  readonly path?: string;
}

export async function buildHotsiteMetadata({
  manifest,
  slug,
  path = '',
}: BuildHotsiteMetadataParams): Promise<Metadata> {
  const url = `${SITE_URL}/${slug}${path}`;
  const location = manifest.business.address
    ? `${manifest.business.address.city}, ${manifest.business.address.state}`
    : null;
  const locale = resolveSupportedLocale(manifest.localization.language);
  const messages = (await getMessages(locale)) as IntlMessages;
  const t = createTranslator<IntlMessages, 'seo'>({ locale, messages, namespace: 'seo' });
  const name = manifest.tenant.name;
  const defaultTitle = location
    ? t('defaultTitleWithLocation', { name, location })
    : t('defaultTitle', { name });
  const defaultDescription = location
    ? t('defaultDescriptionWithLocation', { name, location })
    : t('defaultDescription', { name });
  const title = manifest.seo.title ?? defaultTitle;
  const description = manifest.seo.description ?? defaultDescription;
  const openGraphLocale = manifest.localization.language.replaceAll('-', '_');

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Ikaro',
      locale: openGraphLocale,
      type: 'website',
      images: manifest.branding.logoUrl
        ? [{ url: manifest.branding.logoUrl, width: 1200, height: 630 }]
        : [],
    },
    robots: manifest.isPublished ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export interface LocalBusinessJsonLd {
  readonly '@context': 'https://schema.org';
  readonly '@type': 'LocalBusiness';
  readonly name: string;
  readonly url: string;
}

export interface BuildLocalBusinessJsonLdParams {
  readonly manifest: HotsiteManifestResponse;
  readonly slug: string;
}

export function buildLocalBusinessJsonLd({
  manifest,
  slug,
}: BuildLocalBusinessJsonLdParams): LocalBusinessJsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: manifest.tenant.name,
    url: `${SITE_URL}/${slug}`,
  };
}

// Escapes "<" so a "</script>" sequence in JSON-LD data cannot break out of the
// surrounding <script type="application/ld+json"> tag (< is valid inside a JSON string).
export function toJsonLdScript(data: unknown): string {
  const backslash = String.fromCodePoint(92);
  return JSON.stringify(data).replaceAll('<', `${backslash}u003c`);
}
