import Image from 'next/image';
import type React from 'react';
import type { HeroModuleData } from '@ikaro/types';
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

interface HeroModuleProps extends SectionPresentationProps {
  readonly data: HeroModuleData;
  readonly slug: string;
  readonly tenantBrand?: { name: string; tagline?: string };
}

// An explicit `presentation.surface` swaps the hero tokens for the section's derived, contrast-safe
// ones (the shell sets `--ba-section-*` on the section only); without it nothing changes.
const HERO_TEXT = 'var(--ba-section-text, var(--ba-hero-text))';

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: HERO_TEXT,
};

const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

const secondaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'transparent',
  color: HERO_TEXT,
  borderColor: HERO_TEXT,
  borderRadius: 'var(--ba-radius)',
  opacity: 0.85,
};

function HeroTextContent({
  data,
  ctaHref,
  ctaJustifyClass,
  large = false,
}: {
  readonly data: HeroModuleData;
  readonly ctaHref: string;
  readonly ctaJustifyClass: string;
  readonly large?: boolean;
}): React.JSX.Element {
  const secondaryHref = data.secondaryCtaTarget ? `#${data.secondaryCtaTarget}` : undefined;

  return (
    <>
      {data.eyebrow && <SectionEyebrow text={data.eyebrow} />}
      <h1
        className={`mb-4 font-bold ${large ? 'text-5xl sm:text-7xl' : 'text-4xl sm:text-5xl'}`}
        style={headingStyle}
      >
        {data.title}
      </h1>
      {data.subtitle && (
        <p
          className="mb-8 text-lg opacity-90 sm:text-xl"
          style={{ color: HERO_TEXT }}
          data-testid="hero-subtitle"
        >
          {data.subtitle}
        </p>
      )}
      <div className={['flex flex-wrap gap-4', ctaJustifyClass].filter(Boolean).join(' ')}>
        <a
          href={ctaHref}
          style={primaryBtnStyle}
          className="inline-block border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 hover:bg-[var(--ba-btn-hover-bg)]"
        >
          {data.ctaLabel}
        </a>
        {data.secondaryCtaLabel && secondaryHref && (
          <a
            href={secondaryHref}
            style={secondaryBtnStyle}
            className="inline-block border-2 px-8 py-3 font-semibold transition-all hover:opacity-100"
            data-testid="hero-secondary-cta"
          >
            {data.secondaryCtaLabel}
          </a>
        )}
      </div>
    </>
  );
}

interface HeroVariantProps extends SectionPresentationProps {
  readonly data: HeroModuleData;
  readonly tenantBrand?: { name: string; tagline?: string };
}

// The centered composition, and `immersive`: the same composition pinned bottom-left over a
// full-bleed photo, taller and with a larger title (an explicit contentPositionX/Y still wins).
function HeroCentered({
  data,
  presentation,
  sectionTokens,
}: Omit<HeroVariantProps, 'tenantBrand'>): React.JSX.Element {
  const ctaHref = `#${data.ctaTarget}`;
  const bgUrl = data.backgroundImageUrl;
  const objectPosition = `${data.backgroundImagePosition ?? 'center'} center`;
  const isImmersive = data.variant === 'immersive';

  // contentPositionX only applies to this variant — the left-aligned variant's text column
  // position is structural (grid order), not free-floating (M18-S05). The stage constrains
  // left/right anchoring to the same max-w-7xl content container every other hotsite section
  // uses (ServiceListModule/AboutModule/ContactModule) — without it, a 'left'/'right'
  // contentPositionX would push the block flush against the raw viewport edge rather than
  // respecting the site's usual content width and edge breathing room (M18-S05 follow-up fix).
  const { sectionClassName, stageClassName, wrapperClassName, justifyClass } =
    buildContentStageClasses(
      data.contentPositionX ?? (isImmersive ? 'left' : undefined),
      data.contentPositionY ?? (isImmersive ? 'bottom' : undefined),
      isImmersive
        ? 'relative flex min-h-[70vw] px-6 sm:min-h-[48vw]'
        : 'relative flex min-h-[42.86vw] px-6 sm:min-h-[31.25vw]',
      `${textColumnWidthClass(presentation?.contentWidth, isImmersive ? 'max-w-4xl' : 'max-w-3xl')} py-16`,
    );
  // The CTA row had no justify-content class at all before this field existed (flex defaults
  // to flex-start) — unlike the section/stage above, which already hardcoded items-center/
  // justify-center explicitly. To keep "unset renders identically to today" literally true for
  // the row too, only apply a justify class here when contentPositionX is explicitly set —
  // never as a silent default.
  const ctaJustifyClass = data.contentPositionX || isImmersive ? justifyClass : '';

  return (
    // Both breakpoints use a vw-relative (container-width-relative) min-height floor, never a vh
    // one: vh stays pinned to the viewport height while the container narrows, so the box gets
    // progressively more portrait and the crop worse at every width in between. 42.86vw (21:9) and
    // 31.25vw (~16:5) keep a landscape ratio at every window width.
    <HotsiteSectionShell
      dataVariant={data.variant}
      className={sectionClassName}
      legacyBackground={bgUrl ? undefined : 'var(--ba-hero-bg)'}
      selfLayout
      presentation={presentation}
      sectionTokens={sectionTokens}
      ownBackground={
        bgUrl ? (
          <Image
            src={bgUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition }}
          />
        ) : undefined
      }
    >
      <div className={stageClassName}>
        <div className={wrapperClassName}>
          <HeroTextContent
            data={data}
            ctaHref={ctaHref}
            ctaJustifyClass={ctaJustifyClass}
            large={isImmersive}
          />
        </div>
      </div>
    </HotsiteSectionShell>
  );
}

// Text on the left, an optional right panel (the photo or the brand card).
function HeroLeftAligned({
  data,
  tenantBrand,
  presentation,
  sectionTokens,
}: HeroVariantProps): React.JSX.Element {
  const ctaHref = `#${data.ctaTarget}`;
  const bgUrl = data.backgroundImageUrl;
  const objectPosition = `${data.backgroundImagePosition ?? 'center'} center`;

  // Determine what to render in the right column.
  // If rightPanel is not set, fall back based on whether an image URL is present.
  const rightPanel = data.rightPanel ?? (bgUrl ? 'image' : 'none');

  const hasRightPanel =
    rightPanel !== 'none' &&
    (rightPanel !== 'image' || !!bgUrl) &&
    (rightPanel !== 'brand-card' || !!tenantBrand);
  // contentPositionX is not read here — see the comment on the centered branch above.
  // contentPositionY drives the *grid's* cross-axis alignment, not the outer section's — the
  // section's min-h-[31.25vw] is a floor, not a fixed height (M18-S04: "grows instead of
  // clipping"), so for any real content taller than that floor (the common case once there's a
  // right panel), align-items on the section has no visible effect at all. The grid row is where
  // Y actually does something: aligning the text column against the image/brand-card column when
  // they differ in height (cross-tool review finding, PR #295).
  const itemsClass = contentItemsClass(data.contentPositionY);

  return (
    // A single vw-relative floor at every breakpoint, not min-h-screen/sm:min-h-[60vh] (both
    // vh-relative — same category of bug as the image-sizing ones above, flagged in cross-tool
    // review: this wrapper's height stays pinned to the browser's viewport height as its window is
    // narrowed, rather than scaling with its own width). This wrapper only contains normal-flow
    // content (the text column + image panel grid), not a cropped image directly, so a single
    // modest floor is enough — real content still determines the actual height above it.
    <HotsiteSectionShell
      dataVariant="left-aligned"
      className="relative flex min-h-[31.25vw] items-center px-6 py-16"
      legacyBackground="var(--ba-hero-bg)"
      selfLayout
      presentation={presentation}
      sectionTokens={sectionTokens}
    >
      <div className={`relative z-10 mx-auto w-full ${gridWidthClass(presentation?.contentWidth)}`}>
        <div
          className={`grid grid-cols-1 gap-12 ${itemsClass} ${hasRightPanel ? 'sm:grid-cols-2' : ''}`}
        >
          <div>
            <HeroTextContent data={data} ctaHref={ctaHref} ctaJustifyClass="" />
          </div>
          {rightPanel === 'brand-card' && tenantBrand && (
            <BrandCard
              name={tenantBrand.name}
              tagline={tenantBrand.tagline}
              testId="brand-card"
              taglineTestId="brand-card-tagline"
            />
          )}
          {rightPanel === 'image' && bgUrl && (
            // sm:min-h-[15.6vw], not vh — same reasoning as the centered variant above. This
            // panel renders at roughly half the section's width at sm:+ (grid-cols-2), so 15.6vw
            // approximates the same ~16:5 landscape ratio as the centered variant's 31.25vw does
            // at full width (31.25 / 2 ≈ 15.6).
            <div className="relative aspect-[21/9] sm:aspect-auto sm:h-full sm:min-h-[15.6vw]">
              <Image
                src={bgUrl}
                alt=""
                fill
                priority
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

export function HeroModule({
  data,
  slug: _,
  tenantBrand,
  presentation,
  sectionTokens,
}: HeroModuleProps): React.JSX.Element {
  return data.variant === 'left-aligned' ? (
    <HeroLeftAligned
      data={data}
      tenantBrand={tenantBrand}
      presentation={presentation}
      sectionTokens={sectionTokens}
    />
  ) : (
    <HeroCentered data={data} presentation={presentation} sectionTokens={sectionTokens} />
  );
}
