import type React from 'react';
import type { GalleryModuleData } from '@beloauto/types';
import { sectionHeadingFont } from '@/lib/hotsite/module-styles';
import { GalleryGrid } from './GalleryGrid';
import { GalleryItem } from './GalleryItem';

interface GalleryModuleProps {
  readonly data: GalleryModuleData;
  readonly slug: string;
}

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-text)',
};

export function GalleryModule({ data, slug: _ }: GalleryModuleProps) {
  if (data.images.length === 0) {
    return null;
  }

  const title = data.title ?? 'Nossos Resultados';
  const gridClass =
    data.layout === 'masonry'
      ? 'columns-2 sm:columns-3 gap-4 [&>*]:mb-4'
      : 'grid grid-cols-2 sm:grid-cols-3 gap-4';

  return (
    <section
      style={{
        backgroundColor: 'var(--ba-background)',
        color: 'var(--ba-text)',
        padding: 'var(--ba-section-py) 1.5rem',
      }}
    >
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-10 text-center text-3xl font-bold" style={headingStyle}>
          {title}
        </h2>
        <GalleryGrid maxVisible={data.maxVisible} totalImages={data.images.length}>
          <div className={gridClass}>
            {data.images.map((image, i) => (
              <a
                key={image.url}
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                data-gallery-url={image.url}
                data-gallery-caption={image.caption ?? ''}
                data-gallery-extra={i >= data.maxVisible ? '' : undefined}
                className="block cursor-zoom-in"
              >
                <GalleryItem image={image} priority={i === 0} />
              </a>
            ))}
          </div>
        </GalleryGrid>
      </div>
    </section>
  );
}
