import Image from 'next/image';
import type React from 'react';
import type { HotsiteModulePresentation } from '@ikaro/types';
import type { SectionTokens } from '@/features/platform/hotsite/apply-branding';
import type { SectionTint } from '@/features/platform/hotsite/section-tints';
import {
  contentWidthClass,
  resolveMinHeight,
  resolvePaddingBlock,
  resolvePresentationBackgroundImage,
  resolveSectionScrim,
} from '@/features/platform/hotsite/section-presentation';

// What the render plan hands every presentation-aware module: the module's validated
// `presentation` (only when it parsed) and, when it sets a `surface`, the scoped contrast tokens
// derived from it.
export interface SectionPresentationProps {
  readonly presentation?: HotsiteModulePresentation;
  readonly sectionTokens?: SectionTokens;
  readonly tints?: readonly [SectionTint, SectionTint, SectionTint];
}

interface HotsiteSectionShellProps extends SectionPresentationProps {
  readonly id?: string;
  readonly className?: string;
  readonly dataVariant?: string;
  // The module's own choices, used while `presentation` does not override them. A module that has
  // no `presentation` therefore renders the markup and styles it always did.
  readonly legacyBackground?: string;
  readonly legacyColor?: string;
  readonly legacyPadding?: string;
  // A flow section wraps its children in the bounded content container (`standard` is the
  // long-standing `max-w-7xl`). The hero family (Hero, Booking CTA, Lead Form) lays out its own
  // stage and applies `presentation.contentWidth` to its own text column or grid instead.
  readonly flow?: boolean;
  // Extra classes for the bounded content container, e.g. About's two-column grid.
  readonly contentClassName?: string;
  // The module lays out its own flex stage, so a minimum height needs no centering from the shell.
  readonly selfLayout?: boolean;
  // The module paints its own full-bleed photo (passed as `ownBackground`); `presentation.background`
  // is rejected for these modules, so one section never has two competing background images.
  readonly ownBackground?: React.ReactNode;
  readonly children: React.ReactNode;
}

// The one full-width section every hotsite module renders through. Surface, background photo,
// overlay, minimum height and vertical padding come from the module's `presentation`; the module
// only arranges its content inside. Production sections stay viewport-wide: only the inner
// content container is width-bounded.
export function HotsiteSectionShell({
  id,
  className,
  dataVariant,
  legacyBackground,
  legacyColor,
  legacyPadding,
  flow = false,
  contentClassName,
  selfLayout = false,
  ownBackground,
  presentation,
  sectionTokens,
  children,
}: HotsiteSectionShellProps): React.JSX.Element {
  const hasSurface = sectionTokens !== undefined;
  const backgroundImage = resolvePresentationBackgroundImage(presentation);
  const hasPhoto = backgroundImage !== null || ownBackground !== undefined;
  const scrim = resolveSectionScrim(presentation, hasPhoto);
  const hasLayers = hasPhoto || scrim !== undefined;

  const minHeight = resolveMinHeight(presentation?.minHeight);
  const paddingBlock = resolvePaddingBlock(presentation?.padding);
  const centersContent = minHeight !== undefined && minHeight !== 'auto' && !selfLayout;

  const style: React.CSSProperties = {
    ...(hasSurface
      ? {
          ...sectionTokens,
          backgroundColor: 'var(--ba-section-bg)',
          color: 'var(--ba-section-text)',
        }
      : {
          ...(legacyBackground ? { backgroundColor: legacyBackground } : {}),
          ...(legacyColor ? { color: legacyColor } : {}),
        }),
    ...(legacyPadding ? { padding: legacyPadding } : {}),
    ...(paddingBlock === undefined ? {} : { paddingBlock }),
    ...(minHeight === undefined ? {} : { minHeight }),
  };

  const sectionClassName =
    [className, hasLayers && 'relative', centersContent && 'flex flex-col justify-center']
      .filter(Boolean)
      .join(' ') || undefined;

  const wrapperClassName = [
    'mx-auto',
    'w-full',
    contentWidthClass(presentation?.contentWidth),
    hasLayers && 'relative z-10',
    contentClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section id={id} data-variant={dataVariant} className={sectionClassName} style={style}>
      {ownBackground}
      {backgroundImage && (
        <Image
          src={backgroundImage.url}
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: backgroundImage.objectPosition }}
        />
      )}
      {scrim !== undefined && (
        <div
          aria-hidden="true"
          data-testid="section-overlay"
          className="pointer-events-none absolute inset-0"
          style={{ background: scrim }}
        />
      )}
      {flow ? <div className={wrapperClassName}>{children}</div> : children}
    </section>
  );
}
