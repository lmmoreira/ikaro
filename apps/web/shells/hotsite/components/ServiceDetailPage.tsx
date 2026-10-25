import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { buildBookingDeepLinkUrl } from '@ikaro/types';
import type { HotsiteServiceDetailResponse, ServiceDetailPageSettings } from '@ikaro/types';
import { sectionHeadingFont } from '@/features/platform/hotsite/module-styles';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { RestrictedMarkdown } from './RestrictedMarkdown';

interface ServiceDetailPageProps {
  readonly slug: string;
  readonly service: HotsiteServiceDetailResponse;
  readonly settings: ServiceDetailPageSettings;
}

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-text)',
  fontWeight: 'var(--ba-heading-weight, 700)',
  textTransform: 'var(--ba-heading-transform, none)',
};

// Every block painted on the secondary colour sets that colour's own text token: the page text
// colour (--ba-text) is only guaranteed to be legible on the page background, and a tenant's
// secondary colour can sit close to it (applyBranding derives --ba-secondary-text for this).
const onSecondaryStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-secondary)',
  color: 'var(--ba-secondary-text, var(--ba-text))',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-btn-radius, var(--ba-radius))',
};

const COVER_ASPECT: Record<ServiceDetailPageSettings['heroStyle'], string> = {
  cover: 'aspect-[16/7]',
  compact: 'aspect-[16/4]',
};

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xl font-bold" style={headingStyle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Gallery({
  urls,
  layout,
}: {
  readonly urls: readonly string[];
  readonly layout: ServiceDetailPageSettings['galleryLayout'];
}): React.JSX.Element {
  const featured = layout === 'featured';
  return (
    <ul
      className={`grid gap-3 ${featured ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}
      data-testid="service-gallery"
      data-layout={layout}
    >
      {urls.map((url, index) => (
        <li
          key={`${url}-${index}`}
          className={featured && index === 0 ? 'col-span-2 aspect-[16/8]' : 'aspect-[4/3]'}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded public image, the backend-resolved URL as given */}
          <img
            src={url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            style={{ borderRadius: 'var(--ba-radius)' }}
          />
        </li>
      ))}
    </ul>
  );
}

// UC-109 — the branded page of one service. It inherits the tenant's branding tokens from
// app/[slug]/layout.tsx and shows only what the service's profile actually has: a profile with just
// a name and short description renders no empty headings or placeholder boxes. The primary action
// enters the existing service-first booking flow with this service preselected and no date — the
// booking flow decides every following step from the live service model.
export function ServiceDetailPage({
  slug,
  service,
  settings,
}: ServiceDetailPageProps): React.JSX.Element {
  const t = useTranslations('hotsite.serviceDetail');
  const { profile } = service;
  // A customer-chosen duration has no fixed length or price to state; the booking flow quotes it.
  const isFixed = service.durationPolicy === 'FIXED';
  const ctaLabel = settings.bookingCtaLabel || t('bookCta');
  const bookingHref = buildBookingDeepLinkUrl(`/${slug}`, { serviceId: service.id });
  const hasChips =
    (settings.showPrice && isFixed) ||
    (settings.showDuration && isFixed) ||
    (settings.showLoyaltyPoints && service.loyaltyPointsValue > 0);

  return (
    <main
      className="min-h-screen px-6 pb-16 pt-5"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <div className="mx-auto max-w-4xl">
        <Link
          href={`/${slug}#service-list`}
          data-testid="service-back-link"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: 'var(--ba-primary)' }}
        >
          <span aria-hidden="true">←</span> {t('backToServices')}
        </Link>

        {profile.coverImageUrl && (
          <div
            className={`w-full overflow-hidden ${COVER_ASPECT[settings.heroStyle]}`}
            style={{ borderRadius: 'var(--ba-radius)', boxShadow: 'var(--ba-shadow)' }}
            data-testid="service-cover"
            data-hero-style={settings.heroStyle}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded public image, the backend-resolved URL as given */}
            <img
              src={profile.coverImageUrl}
              alt={service.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <h1
          className="mt-5 text-3xl font-extrabold leading-tight"
          style={{ ...headingStyle, fontWeight: 'var(--ba-heading-weight, 800)' }}
        >
          {service.name}
        </h1>
        {service.description && (
          <p className="mt-2 max-w-2xl text-lg opacity-80">{service.description}</p>
        )}

        {hasChips && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label={service.name}>
            {settings.showPrice && isFixed && (
              <li
                className="rounded-full px-3.5 py-1.5 text-sm font-semibold"
                style={{ backgroundColor: 'var(--ba-primary)', color: 'var(--ba-btn-text)' }}
                data-testid="service-price"
              >
                {service.price.formatted}
              </li>
            )}
            {settings.showDuration && isFixed && (
              <li
                className="rounded-full px-3.5 py-1.5 text-sm font-semibold"
                style={onSecondaryStyle}
                data-testid="service-duration"
              >
                {formatDuration(service.durationMinutes)}
              </li>
            )}
            {settings.showLoyaltyPoints && service.loyaltyPointsValue > 0 && (
              <li
                className="rounded-full px-3.5 py-1.5 text-sm font-semibold"
                style={onSecondaryStyle}
                data-testid="service-points"
              >
                {t('loyaltyPoints', { count: service.loyaltyPointsValue })}
              </li>
            )}
          </ul>
        )}

        <Link
          href={bookingHref}
          data-testid="service-book-cta"
          className="mt-5 inline-block border-2 px-6 py-2.5 font-semibold transition-all hover:bg-[var(--ba-btn-hover-bg)] hover:opacity-90"
          style={buttonStyle}
        >
          {ctaLabel}
        </Link>

        {profile.longDescription && (
          <Section title={t('about')}>
            <div data-testid="service-about">
              <RestrictedMarkdown density="comfortable">
                {profile.longDescription}
              </RestrictedMarkdown>
            </div>
          </Section>
        )}

        {profile.inclusions.length > 0 && (
          <Section title={t('inclusions')}>
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2" data-testid="service-inclusions">
              {profile.inclusions.map((item, index) => (
                <li key={`${item}-${index}`} className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className="font-extrabold"
                    style={{ color: 'var(--ba-primary)' }}
                  >
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {profile.preparationNotes && (
          <Section title={t('preparation')}>
            <p
              className="whitespace-pre-line p-4 leading-relaxed"
              style={{ ...onSecondaryStyle, borderRadius: 'var(--ba-radius)' }}
              data-testid="service-preparation"
            >
              {profile.preparationNotes}
            </p>
          </Section>
        )}

        {profile.galleryImageUrls.length > 0 && (
          <Section title={t('gallery')}>
            <Gallery urls={profile.galleryImageUrls} layout={settings.galleryLayout} />
          </Section>
        )}

        <div
          className="mt-12 flex flex-wrap items-center justify-between gap-4 p-6"
          style={{ ...onSecondaryStyle, borderRadius: 'var(--ba-radius)' }}
        >
          <p className="max-w-md text-sm opacity-80">{t('bookHint')}</p>
          <Link
            href={bookingHref}
            className="border-2 px-6 py-2.5 font-semibold transition-all hover:bg-[var(--ba-btn-hover-bg)] hover:opacity-90"
            style={buttonStyle}
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </main>
  );
}
