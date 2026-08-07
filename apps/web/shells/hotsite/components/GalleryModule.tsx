import { useTranslations } from 'next-intl';
import type React from 'react';
import type { GalleryModuleData } from '@ikaro/types';
import { sectionHeadingFont } from '@/features/platform/hotsite/module-styles';
import { GalleryGrid } from './GalleryGrid';
import { GalleryItem } from './GalleryItem';
import { SectionEyebrow } from './SectionEyebrow';

interface GalleryModuleProps {
  readonly data: GalleryModuleData;
  readonly slug: string;
  readonly bgVariant?: 'default' | 'alt';
}

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-text)',
};

// Masonry (M18-S06/S07 follow-up): flex-wrap rows, not CSS columns. columns-N is column-major —
// it has no concept of a "row" at all, so an uneven count (e.g. 3 images in 2 columns) always
// stacks the remainder in whichever column got there first, leaving a large lopsided gap the
// technique has no way to center (confirmed against real screenshots — user: "not harmonic").
// flex-wrap + justify-center centers a short last row automatically, which is what actually
// solves that — CSS columns can't, no matter how the column count is tuned.
//
// A fixed 3/row desktop, 2/row mobile — no count-based branching. An earlier version capped
// desktop at 2/row for ≤3 images (reasoning: avoid tiny tiles at low counts); tested against real
// screenshots, that made every tile 50% width — "really big... enormous" for the exact case (3
// images) that fits a 3-column row perfectly with zero remainder. Since flex-wrap centers any
// remainder gracefully regardless of column count, there's no reason left to reduce the column
// count for a low image count — a consistent target is both simpler and matches the tile size
// actually wanted.
//
// gap-4's 1rem is baked into the calc() below — flex-basis percentages don't otherwise account
// for gap, and would overflow/wrap early without the compensation term.
const MASONRY_TILE_BASIS_CLASS = 'basis-[calc(50%-0.5rem)] sm:basis-[calc(33.333%-0.667rem)]';

// 'big', then reading order (top-middle, top-right, bottom-middle, bottom-right on desktop) —
// matches .gallery-featured-grid's grid-template-areas in globals.css (M18-S07).
const FEATURED_GRID_AREAS = ['big', 's1', 's2', 's3', 's4'] as const;

export function GalleryModule({
  data,
  slug: _,
  bgVariant,
}: GalleryModuleProps): React.JSX.Element | null {
  const t = useTranslations('hotsite');

  if (data.images.length === 0) {
    return null;
  }

  const title = data.title ?? t('gallery.defaultTitle');
  const bg = bgVariant === 'alt' ? 'var(--ba-secondary)' : 'var(--ba-background)';

  // 'featured' needs at least 5 images to fill its fixed template — fewer than that renders as
  // 'grid' instead. More than 5 is fine: only the first 5 (images.slice(0, 5) below) are used,
  // matching the config panel's own gate. Display-time only: the stored layout value is
  // untouched, so restoring a 5th image brings the featured view back with no re-selection
  // needed (M18-S07).
  const effectiveLayout: 'grid' | 'masonry' | 'featured' =
    data.layout === 'featured' && data.images.length < 5 ? 'grid' : data.layout;

  const gridContent =
    effectiveLayout === 'featured' ? (
      <GalleryGrid maxVisible={5} totalImages={5}>
        <div
          className="gallery-featured-grid gap-3"
          data-featured-position={data.featuredPosition ?? 'left'}
        >
          {data.images.slice(0, 5).map((image, i) => (
            <a
              key={image.url}
              href={image.url}
              target="_blank"
              rel="noopener noreferrer"
              data-gallery-url={image.url}
              data-gallery-caption={image.caption ?? ''}
              className="block cursor-zoom-in overflow-hidden"
              style={{ gridArea: FEATURED_GRID_AREAS[i], borderRadius: 'var(--ba-radius)' }}
            >
              <GalleryItem
                image={image}
                layout="featured"
                priority={i === 0}
                isFeaturedPrimary={i === 0}
              />
            </a>
          ))}
        </div>
      </GalleryGrid>
    ) : (
      <GalleryGrid maxVisible={data.maxVisible} totalImages={data.images.length}>
        <div
          className={
            effectiveLayout === 'masonry'
              ? 'flex flex-wrap justify-center items-start gap-4'
              : 'grid grid-cols-2 sm:grid-cols-3 gap-4'
          }
        >
          {data.images.map((image, i) => (
            <a
              key={image.url}
              href={image.url}
              target="_blank"
              rel="noopener noreferrer"
              data-gallery-url={image.url}
              data-gallery-caption={image.caption ?? ''}
              data-gallery-extra={i >= data.maxVisible ? '' : undefined}
              className={
                effectiveLayout === 'masonry'
                  ? `block cursor-zoom-in ${MASONRY_TILE_BASIS_CLASS}`
                  : 'block cursor-zoom-in'
              }
            >
              <GalleryItem image={image} layout={effectiveLayout} priority={i === 0} />
            </a>
          ))}
        </div>
      </GalleryGrid>
    );

  return (
    <section
      id="gallery"
      style={{
        backgroundColor: bg,
        color: 'var(--ba-text)',
        padding: 'var(--ba-section-py) 1.5rem',
      }}
    >
      <div className="mx-auto max-w-7xl">
        {data.eyebrow && (
          <div className="text-center">
            <SectionEyebrow text={data.eyebrow} />
          </div>
        )}
        <h2 className="mb-10 text-center text-3xl font-bold" style={headingStyle}>
          {title}
        </h2>
        {gridContent}
      </div>
    </section>
  );
}
