import Image from 'next/image';
import Link from 'next/link';
import type React from 'react';
import type { BookingCtaModuleData } from '@ikaro/types';
import { sectionHeadingFont } from '@/features/platform/hotsite/module-styles';
import { SectionEyebrow } from './SectionEyebrow';

interface BookingCtaModuleProps {
  readonly data: BookingCtaModuleData;
  readonly slug: string;
  readonly tenantBrand?: { name: string; tagline?: string };
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

function resolveSectionBg(bgStyle: BookingCtaModuleData['bgStyle']): string {
  return bgStyle === 'background' ? 'var(--ba-background)' : 'var(--ba-primary)';
}

// When section bg is primary, text must contrast against it (use --ba-hero-text).
// When section bg is background, text can use --ba-text normally.
function resolveTextColor(bgStyle: BookingCtaModuleData['bgStyle']): string {
  return bgStyle === 'background' ? 'var(--ba-text)' : 'var(--ba-hero-text)';
}

function BrandCard({
  name,
  tagline,
}: {
  readonly name: string;
  readonly tagline?: string;
}): React.JSX.Element {
  return (
    <div
      className="flex flex-shrink-0 flex-col items-center justify-center p-8 text-center sm:p-10"
      style={{
        backgroundColor: 'var(--ba-secondary)',
        border: '2px solid var(--ba-primary)',
        borderRadius: 'var(--ba-radius)',
      }}
      data-testid="booking-cta-brand-card"
    >
      <div
        className="text-2xl font-black uppercase tracking-widest sm:text-3xl"
        style={{ color: 'var(--ba-primary)' }}
      >
        {name}
      </div>
      {tagline && (
        <div
          className="mt-2 text-xs uppercase tracking-widest"
          style={{ color: 'var(--ba-text)', opacity: 0.6 }}
        >
          {tagline}
        </div>
      )}
    </div>
  );
}

function BookingCtaContent({
  data,
  slug,
}: {
  readonly data: BookingCtaModuleData;
  readonly slug: string;
}): React.JSX.Element {
  const textColor = resolveTextColor(data.bgStyle);

  return (
    <>
      {data.eyebrow && <SectionEyebrow text={data.eyebrow} />}
      <h2
        className="mb-4 text-3xl font-bold sm:text-4xl"
        style={{ ...sectionHeadingFont, color: textColor }}
      >
        {data.title}
      </h2>
      {data.subtitle && (
        <p
          className="mb-8 text-lg opacity-90"
          style={{ color: textColor }}
          data-testid="booking-cta-subtitle"
        >
          {data.subtitle}
        </p>
      )}
      <Link
        href={`/${slug}/booking`}
        style={btnStyle}
        className="inline-block border-2 px-8 py-3 font-semibold transition-all hover:bg-[var(--ba-btn-hover-bg)] hover:opacity-90"
      >
        {data.ctaLabel}
      </Link>
    </>
  );
}

export function BookingCtaModule({
  data,
  slug,
  tenantBrand,
}: BookingCtaModuleProps): React.JSX.Element {
  const bgUrl = data.backgroundImageUrl;
  const variant = data.variant ?? 'centered';
  const sectionBg = resolveSectionBg(data.bgStyle);
  const showBrandCard = data.rightPanel === 'brand-card' && !!tenantBrand;

  if (variant === 'left-aligned') {
    const hasRightPanel = showBrandCard || !!bgUrl;
    return (
      <section
        id="booking-form"
        className="relative flex min-h-[40vh] items-center"
        style={{ backgroundColor: sectionBg }}
      >
        <div className="w-full max-w-7xl px-6 py-16 mx-auto">
          <div
            className={`grid grid-cols-1 gap-12 items-center ${hasRightPanel ? 'sm:grid-cols-2' : ''}`}
          >
            <div>
              <BookingCtaContent data={data} slug={slug} />
            </div>
            {showBrandCard && tenantBrand && (
              <BrandCard name={tenantBrand.name} tagline={tenantBrand.tagline} />
            )}
            {!showBrandCard && bgUrl && (
              <div className="relative h-64 sm:h-full sm:min-h-[40vh]">
                <Image
                  src={bgUrl}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                  style={{ borderRadius: 'var(--ba-radius)' }}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="booking-form"
      className="relative flex min-h-[40vh] items-center justify-center px-6 py-20 text-center sm:py-28"
      style={{ backgroundColor: bgUrl ? undefined : sectionBg }}
    >
      {bgUrl && <Image src={bgUrl} alt="" fill sizes="100vw" className="object-cover" />}
      <div className="relative z-10 mx-auto max-w-2xl">
        <BookingCtaContent data={data} slug={slug} />
      </div>
    </section>
  );
}
