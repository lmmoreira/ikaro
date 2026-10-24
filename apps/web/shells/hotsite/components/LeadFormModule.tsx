import Image from 'next/image';
import Link from 'next/link';
import type React from 'react';
import type { LeadFormModuleData } from '@ikaro/types';
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
import { SectionEyebrow } from './SectionEyebrow';

interface LeadFormModuleProps extends SectionPresentationProps {
  readonly data: LeadFormModuleData;
  readonly slug: string;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-btn-radius, var(--ba-radius))',
};

function resolveSectionBg(bgStyle: LeadFormModuleData['bgStyle']): string {
  return bgStyle === 'background' ? 'var(--ba-background)' : 'var(--ba-primary)';
}

// When section bg is primary, text must contrast against it (use --ba-hero-text).
// When section bg is background, text can use --ba-text normally.
function resolveTextColor(bgStyle: LeadFormModuleData['bgStyle']): string {
  const fallback = bgStyle === 'background' ? 'var(--ba-text)' : 'var(--ba-hero-text)';
  // An explicit presentation.surface carries derived, contrast-safe section tokens; without it
  // this is the module's own bgStyle choice, unchanged.
  return `var(--ba-section-text, ${fallback})`;
}

function LeadFormContent({
  data,
  slug,
  large = false,
}: {
  readonly data: LeadFormModuleData;
  readonly slug: string;
  readonly large?: boolean;
}): React.JSX.Element {
  const textColor = resolveTextColor(data.bgStyle);

  return (
    <>
      {data.eyebrow && <SectionEyebrow text={data.eyebrow} />}
      <h2
        className={`mb-4 font-bold ${large ? 'text-4xl sm:text-6xl' : 'text-3xl sm:text-4xl'}`}
        style={{
          ...sectionHeadingFont,
          color: textColor,
          fontWeight: 'var(--ba-heading-weight, 700)',
          textTransform: 'var(--ba-heading-transform, none)',
        }}
      >
        {data.title}
      </h2>
      {data.subtitle && (
        <p
          className="mb-8 text-lg opacity-90"
          style={{ color: textColor }}
          data-testid="lead-form-subtitle"
        >
          {data.subtitle}
        </p>
      )}
      <Link
        href={`/${slug}/lead-form`}
        data-testid="lead-form-cta"
        style={btnStyle}
        className="inline-block border-2 px-8 py-3 font-semibold transition-all hover:bg-[var(--ba-btn-hover-bg)] hover:opacity-90"
      >
        {data.ctaLabel}
      </Link>
    </>
  );
}

// Teaser section only — mirrors BookingCtaModule.tsx (docs/HOTSITE_DYNAMIC_ARCHITECTURE.md
// § 7 Developer Checklist, UC-038). Links out to the dedicated /[slug]/lead-form page (M20-S09),
// which is where the actual question form lives — this component never fetches the question
// catalog itself. LeadFormModuleData is deliberately smaller than BookingCtaModuleData (no
// rightPanel, no contentPositionX/Y) — the left-aligned variant's right panel is therefore always
// just the background image (never a brand-card option), and content anchoring always uses the
// shared centered default (M20-S07).
export function LeadFormModule({
  data,
  slug,
  presentation,
  sectionTokens,
}: LeadFormModuleProps): React.JSX.Element {
  const bgUrl = data.backgroundImageUrl;
  const variant = data.variant ?? 'centered';
  const sectionBg = resolveSectionBg(data.bgStyle);
  const objectPosition = `${data.backgroundImagePosition ?? 'center'} center`;

  if (variant === 'left-aligned') {
    const hasRightPanel = !!bgUrl;
    const itemsClass = contentItemsClass();
    return (
      <HotsiteSectionShell
        id="lead-form"
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
              <LeadFormContent data={data} slug={slug} />
            </div>
            {bgUrl && (
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
  // with a larger title. LeadFormModuleData has no contentPositionX/Y, so the anchoring is fixed.
  const isImmersive = variant === 'immersive';
  const { sectionClassName, stageClassName, wrapperClassName } = buildContentStageClasses(
    isImmersive ? 'left' : undefined,
    isImmersive ? 'bottom' : undefined,
    isImmersive
      ? 'relative flex min-h-[70vw] px-6 py-20 sm:min-h-[48vw] sm:py-28'
      : 'relative flex min-h-[42.86vw] px-6 py-20 sm:min-h-[31.25vw] sm:py-28',
    textColumnWidthClass(presentation?.contentWidth, isImmersive ? 'max-w-3xl' : 'max-w-2xl'),
  );

  return (
    <HotsiteSectionShell
      id="lead-form"
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
          <LeadFormContent data={data} slug={slug} large={isImmersive} />
        </div>
      </div>
    </HotsiteSectionShell>
  );
}
