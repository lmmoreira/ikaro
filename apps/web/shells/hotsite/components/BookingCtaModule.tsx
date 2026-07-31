import Image from 'next/image';
import Link from 'next/link';
import type React from 'react';
import type { BookingCtaModuleData } from '@ikaro/types';
import {
  contentItemsClass,
  contentJustifyClass,
  contentTextAlignClass,
  sectionHeadingFont,
} from '@/features/platform/hotsite/module-styles';
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
  // Same responsive-crop treatment as HeroModule (M18-S04, extended here as a M18-S05
  // follow-up) — this module's background image had the identical wide-banner mobile-crop bug
  // Hero had before M18-S04, just never fixed alongside it.
  const objectPosition = `${data.backgroundImagePosition ?? 'center'} center`;

  if (variant === 'left-aligned') {
    const hasRightPanel = showBrandCard || !!bgUrl;
    // contentPositionX is not read here — the text column position is structural (grid order),
    // not free-floating (M18-S05, same rule as HeroModule).
    const itemsClass = contentItemsClass(data.contentPositionY);
    return (
      <section
        id="booking-form"
        className={`relative flex min-h-[31.25vw] ${itemsClass}`}
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
              <div className="relative aspect-[21/9] sm:aspect-auto sm:h-full sm:min-h-[15.6vw]">
                <Image
                  src={bgUrl}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                  style={{ borderRadius: 'var(--ba-radius)', objectPosition }}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // contentPositionX only applies to the centered variant — same rule as HeroModule.
  const justifyClass = contentJustifyClass(data.contentPositionX);
  const itemsClass = contentItemsClass(data.contentPositionY);
  const textAlignClass = contentTextAlignClass(data.contentPositionX);
  const sectionClassName = [
    'relative flex min-h-[42.86vw]',
    itemsClass,
    'px-6 py-20 sm:min-h-[31.25vw] sm:py-28',
  ].join(' ');
  // The stage constrains left/right anchoring to the same max-w-7xl content container every
  // other hotsite section uses — see HeroModule's identical stageClassName comment (M18-S05
  // follow-up fix).
  const stageClassName = ['relative z-10 flex w-full max-w-7xl mx-auto', justifyClass].join(' ');
  const wrapperClassName = ['max-w-2xl', textAlignClass].filter(Boolean).join(' ');

  return (
    <section
      id="booking-form"
      className={sectionClassName}
      style={{ backgroundColor: bgUrl ? undefined : sectionBg }}
    >
      {bgUrl && (
        <Image
          src={bgUrl}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition }}
        />
      )}
      <div className={stageClassName}>
        <div className={wrapperClassName}>
          <BookingCtaContent data={data} slug={slug} />
        </div>
      </div>
    </section>
  );
}
