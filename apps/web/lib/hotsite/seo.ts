import type { Metadata } from 'next';
import type { HotsiteManifestResponse } from '@beloauto/types';

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

export function buildHotsiteMetadata({
  manifest,
  slug,
  path = '',
}: BuildHotsiteMetadataParams): Metadata {
  const url = `${SITE_URL}/${slug}${path}`;
  const location = manifest.business.address
    ? `${manifest.business.address.city}, ${manifest.business.address.state}`
    : null;
  const defaultTitle = location
    ? `${manifest.tenant.name} — Agendamento Online em ${location}`
    : `${manifest.tenant.name} — Agendamento Online`;
  const defaultDescription = location
    ? `Agende seu serviço na ${manifest.tenant.name}, em ${location}. Rápido, fácil e online.`
    : `Agende seu serviço na ${manifest.tenant.name}. Rápido, fácil e online.`;
  const title = manifest.seo.title ?? defaultTitle;
  const description = manifest.seo.description ?? defaultDescription;
  const locale = manifest.localization.language.replaceAll('-', '_');

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'BeloAuto',
      locale,
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
