import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { GalleryImage } from '@ikaro/types';

interface GalleryItemProps {
  readonly image: GalleryImage;
  readonly priority?: boolean;
}

const badgeStyle = {
  backgroundColor: 'var(--ba-primary)',
  color: '#ffffff',
  borderRadius: 'var(--ba-radius)',
};

export function GalleryItem({ image, priority = false }: GalleryItemProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const photoTypeLabels: Record<'before' | 'after', string> = {
    before: t('gallery.beforeLabel'),
    after: t('gallery.afterLabel'),
  };

  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden"
      style={{ borderRadius: 'var(--ba-radius)' }}
    >
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
