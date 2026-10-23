import type { Metadata } from 'next';
import type { HotsiteManifestResponse } from '@ikaro/types';
import { resolveSeoDefaults } from './seo-defaults';
import { resolveSiteOrigin } from './site-origin';

// This module is server-only (only imported by not-found.tsx/sitemap.ts/robots.ts), so a
// module-level constant computed at import time is safe here — unlike client-bundled code,
// this always runs in the real container process, never frozen at `next build` time.
export const SITE_URL = resolveSiteOrigin();

// A page that is about one thing (a service) names it instead of the tenant's SEO identity.
export interface HotsiteMetadataOverride {
  readonly title?: string;
  readonly description?: string;
  /** A full URL, used as the Open Graph image in place of the tenant's `seo.ogImageUrl`. */
  readonly ogImageUrl?: string;
}

export interface BuildHotsiteMetadataParams {
  readonly manifest: HotsiteManifestResponse;
  readonly slug: string;
  readonly path?: string;
  readonly override?: HotsiteMetadataOverride;
}

export async function buildHotsiteMetadata({
  manifest,
  slug,
  path = '',
  override,
}: BuildHotsiteMetadataParams): Promise<Metadata> {
  const url = `${SITE_URL}/${slug}${path}`;
  const { title: defaultTitle, description: defaultDescription } = await resolveSeoDefaults({
    tenantName: manifest.tenant.name,
    address: manifest.business.address,
    language: manifest.localization.language,
  });
  const title = override?.title ?? manifest.seo.title ?? defaultTitle;
  const description = override?.description ?? manifest.seo.description ?? defaultDescription;
  const ogImageUrl = override?.ogImageUrl ?? manifest.seo.ogImageUrl;
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
      // 1200x630 is nominal, not a measured pixel size — no per-upload dimensions are stored —
      // but it's now honest about the *ratio*: seo.ogImageUrl is auto center-cropped to exactly
      // 1200/630 on upload (see compressImage's targetAspectRatio, M18-S03), unlike the old
      // branding.logoUrl reuse this replaced, which declared this size for an arbitrary-shaped
      // small/square logo. No fallback to branding.logoUrl when unset — a square logo rendered as
      // a landscape card is exactly the bad outcome this field exists to avoid.
      //
      // `images` is omitted entirely (not an empty array) when unset — conditionally spread so
      // the key itself is absent from the object, not just empty.
      ...(ogImageUrl ? { images: [{ url: ogImageUrl, width: 1200, height: 630 }] } : {}),
    },
    robots: manifest.isPublished ? { index: true, follow: true } : { index: false, follow: false },
  };
}

// Favicon (M18-S03) — extracted so it's unit-testable (CLAUDE.md: layout.tsx/page.tsx stay thin,
// Playwright E2E only; reusable logic lives here). branding.logoUrl is guaranteed square after
// compressImage's auto-crop, so it's reused directly — no separate favicon asset. No fallback when
// unset: a <link rel="icon"> can't render a DOM fallback the way HotsiteAuthBar/Footer do, so
// omitting `icons` (browser/framework default) is the only option. Single icon size only — no
// Apple touch icon (180x180): that needs more source resolution than this target, and upscaling a
// small tenant logo would look soft.
export function buildHotsiteIconsMetadata(manifest: HotsiteManifestResponse): Metadata {
  return manifest.branding.logoUrl ? { icons: { icon: [{ url: manifest.branding.logoUrl }] } } : {};
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
