import Image from 'next/image';
import Link from 'next/link';
import type React from 'react';
import type { BookingCtaModuleData } from '@ikaro/types';
import {
  buildContentStageClasses,
  contentItemsClass,
  sectionHeadingFont,
} from '@/features/platform/hotsite/module-styles';
import {
  gridWidthClass,
  textColumnWidthClass,
} from '@/features/platform/hotsite/section-presentation';
import { HotsiteSectionShell, type SectionPresentationProps } from './HotsiteSectionShell';
import { BrandCard } from './BrandCard';
import { SectionEyebrow } from './SectionEyebrow';

interface BookingCtaModuleProps extends SectionPresentationProps {
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
  const fallback = bgStyle === 'background' ? 'var(--ba-text)' : 'var(--ba-hero-text)';
  // An explicit presentation.surface carries derived, contrast-safe section tokens; without it
  // this is the module's own bgStyle choice, unchanged.
  return `var(--ba-section-text, ${fallback})`;
}

function BookingCtaContent({
  data,
  slug,
  large = false,
}: {
  readonly data: BookingCtaModuleData;
  readonly slug: string;
  readonly large?: boolean;
}): React.JSX.Element {
  const textColor = resolveTextColor(data.bgStyle);

  return (
    <>
      {data.eyebrow && <SectionEyebrow text={data.eyebrow} />}
      <h2
        className={`mb-4 font-bold ${large ? 'text-4xl sm:text-6xl' : 'text-3xl sm:text-4xl'}`}
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
  presentation,
  sectionTokens,
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
    // contentPositionY drives the grid's cross-axis alignment, not the outer section's — see
    // HeroModule.tsx's identical comment (cross-tool review finding, PR #295).
    const itemsClass = contentItemsClass(data.contentPositionY);
    return (
      <HotsiteSectionShell
        id="booking-form"
        className="relative flex min-h-[31.25vw] items-center px-6 py-16"
        legacyBackground={sectionBg}
        selfLayout
        presentation={presentation}
        sectionTokens={sectionTokens}
      >
        <div
          className={`relative z-10 mx-auto w-full ${gridWidthClass(presentation?.contentWidth)}`}
        >
          <div
            className={`grid grid-cols-1 gap-12 ${itemsClass} ${hasRightPanel ? 'sm:grid-cols-2' : ''}`}
          >
            <div>
              <BookingCtaContent data={data} slug={slug} />
            </div>
            {showBrandCard && tenantBrand && (
              <BrandCard
                name={tenantBrand.name}
                tagline={tenantBrand.tagline}
                testId="booking-cta-brand-card"
              />
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
      </HotsiteSectionShell>
    );
  }

  // `immersive` is the centered composition pinned bottom-left over a full-bleed photo, taller and
  // with a larger title; an explicit contentPositionX/Y still wins.
  const isImmersive = variant === 'immersive';
  // contentPositionX only applies to the centered variant — same rule as HeroModule. The stage
  // constrains left/right anchoring to the same max-w-7xl content container every other hotsite
  // section uses — see HeroModule's identical comment (M18-S05 follow-up fix).
  const { sectionClassName, stageClassName, wrapperClassName } = buildContentStageClasses(
    data.contentPositionX ?? (isImmersive ? 'left' : undefined),
    data.contentPositionY ?? (isImmersive ? 'bottom' : undefined),
    isImmersive
      ? 'relative flex min-h-[70vw] px-6 py-20 sm:min-h-[48vw] sm:py-28'
      : 'relative flex min-h-[42.86vw] px-6 py-20 sm:min-h-[31.25vw] sm:py-28',
    textColumnWidthClass(presentation?.contentWidth, isImmersive ? 'max-w-3xl' : 'max-w-2xl'),
  );

  return (
    <HotsiteSectionShell
      id="booking-form"
      className={sectionClassName}
      legacyBackground={bgUrl ? undefined : sectionBg}
      selfLayout
      presentation={presentation}
      sectionTokens={sectionTokens}
      ownBackground={
        bgUrl ? (
          <Image
            src={bgUrl}
            alt=""
            fill
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition }}
          />
        ) : undefined
      }
    >
      <div className={stageClassName}>
        <div className={wrapperClassName}>
          <BookingCtaContent data={data} slug={slug} large={isImmersive} />
        </div>
      </div>
    </HotsiteSectionShell>
  );
}
