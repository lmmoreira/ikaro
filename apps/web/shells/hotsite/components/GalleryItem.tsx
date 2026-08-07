import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { GalleryImage } from '@ikaro/types';

interface GalleryItemProps {
  readonly image: GalleryImage;
  readonly layout: 'grid' | 'masonry' | 'featured';
  readonly priority?: boolean;
}

const badgeStyle = {
  backgroundColor: 'var(--ba-primary)',
  color: '#ffffff',
  borderRadius: 'var(--ba-radius)',
};

export function GalleryItem({
  image,
  layout,
  priority = false,
}: GalleryItemProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const photoTypeLabels: Record<'before' | 'after', string> = {
    before: t('gallery.beforeLabel'),
    after: t('gallery.afterLabel'),
  };

  // Three distinct sizing strategies, one per layout:
  // - masonry, with width/height captured (M18-S06): the tile's own natural aspect ratio — this
  //   is what produces the staggered look at all. The parent <a> (GalleryModule) controls the
  //   tile's *width* via a flex-basis class; this div just fills that at 100% and lets its own
  //   aspect-ratio drive height — no break-inside-avoid needed, that was for the earlier CSS
  //   `columns` technique, which flex-wrap (M18-S06/S07 follow-up) replaced.
  // - featured (M18-S07): no self-imposed box at all — GalleryModule places this tile into an
  //   explicit CSS Grid cell (grid-row/grid-column), and imposing a fixed aspect-ratio here would
  //   fight that placement instead of filling it.
  // - grid, or masonry without captured dimensions (a pre-M18-S06 image): a fixed aspect-square
  //   box. Square (not the earlier 4:3) crops far less off a portrait phone photo — a 3:4 source
  //   loses ~44% of its height cropped into a 4:3 landscape box, vs. ~25% into a square one — and
  //   matches the admin preview thumbnails in GalleryImageManager/BookingPhotoPicker, which were
  //   already aspect-square. The full, uncropped photo is always one click away via GalleryGrid's
  //   lightbox (object-fit: contain there, not cover), regardless of which strategy applies here.
  const useNaturalAspectRatio = layout === 'masonry' && image.width != null && image.height != null;

  const wrapperClassName = useNaturalAspectRatio
    ? 'relative w-full overflow-hidden'
    : layout === 'featured'
      ? 'relative h-full w-full overflow-hidden'
      : 'relative aspect-square w-full overflow-hidden';

  const wrapperStyle: React.CSSProperties = {
    borderRadius: 'var(--ba-radius)',
    ...(useNaturalAspectRatio ? { aspectRatio: `${image.width} / ${image.height}` } : {}),
  };

  return (
    <div className={wrapperClassName} style={wrapperStyle}>
      <Image
        src={image.url}
        alt={image.caption?.trim() || t('gallery.photoAlt')}
        fill
        loading={priority ? 'eager' : 'lazy'}
        priority={priority}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="object-cover"
      />
      {image.photoType && (
        <span className="absolute left-2 top-2 px-2 py-1 text-xs font-semibold" style={badgeStyle}>
          {photoTypeLabels[image.photoType]}
        </span>
      )}
      {image.caption && (
        <p className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-2 py-1 text-xs text-white">
          {image.caption}
        </p>
      )}
    </div>
  );
}
