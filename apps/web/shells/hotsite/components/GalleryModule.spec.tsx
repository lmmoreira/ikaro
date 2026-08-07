// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from '@/axe-helper';
import { describe, expect, it } from 'vitest';
import type { GalleryImage, GalleryModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { GalleryModule } from './GalleryModule';

function makeImage(overrides?: Partial<GalleryImage>): GalleryImage {
  return {
    url: 'https://storage.example.com/gallery/photo.jpg',
    source: 'upload',
    ...overrides,
  };
}

function makeData(overrides?: Partial<GalleryModuleData>): GalleryModuleData {
  return {
    images: [makeImage()],
    layout: 'grid',
    maxVisible: 6,
    ...overrides,
  };
}

function makeImages(count: number): GalleryImage[] {
  return Array.from({ length: count }, (_, i) =>
    makeImage({ url: `https://storage.example.com/gallery/photo-${i}.jpg` }),
  );
}

// The gridClass div (grid or columns) is always the direct parent of every gallery tile's <a>
// wrapper — a more stable anchor than the class name itself, which is exactly what's under test.
function galleryGridContainer(container: HTMLElement): Element | null | undefined {
  return container.querySelector('a[data-gallery-url]')?.parentElement;
}

describe('GalleryModule', () => {
  it('renders the default title when none is provided', () => {
    renderWithIntl(<GalleryModule data={makeData()} slug="tenant" />);

    expect(screen.getByRole('heading', { name: 'Nossos Resultados' })).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    renderWithIntl(<GalleryModule data={makeData({ title: 'Galeria de Fotos' })} slug="tenant" />);

    expect(screen.getByRole('heading', { name: 'Galeria de Fotos' })).toBeInTheDocument();
  });

  it('renders nothing when images is empty', () => {
    const { container } = renderWithIntl(
      <GalleryModule data={makeData({ images: [] })} slug="tenant" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a grid layout container for layout: grid', () => {
    const { container } = renderWithIntl(
      <GalleryModule data={makeData({ layout: 'grid' })} slug="tenant" />,
    );

    expect(container.querySelector('.grid')).toBeInTheDocument();
  });

  it('renders a flex-wrap container for layout: masonry, not the grid layout classes', () => {
    const { container } = renderWithIntl(
      <GalleryModule
        data={makeData({ layout: 'masonry', images: makeImages(6), maxVisible: 6 })}
        slug="tenant"
      />,
    );

    expect(galleryGridContainer(container)).toHaveClass('flex', 'flex-wrap', 'justify-center');
    expect(galleryGridContainer(container)).not.toHaveClass('grid');
  });

  // M18-S06/S07 follow-up: CSS `columns` is column-major with no concept of a row, so it has no
  // way to center a lopsided remainder (e.g. 3 images in 2 columns stacks 2-then-1, leaving a
  // large empty gap the technique can't address — confirmed against real screenshots). flex-wrap +
  // justify-center centers a short last row automatically. An earlier version of this fix still
  // capped desktop at 2/row for ≤3 images (avoiding tiny tiles at very low counts) — tested against
  // real screenshots, that made every tile 50% width, "really big/enormous" for exactly the count
  // (3) that fits one clean 3-column row. Since flex-wrap centers any remainder regardless of
  // column count, there's no reason left to vary it by count at all — see MASONRY_TILE_BASIS_CLASS's
  // own doc comment in GalleryModule.tsx.
  describe('masonry tile width is fixed (3/row desktop, 2/row mobile), regardless of image count', () => {
    it.each([1, 2, 3, 4, 20])('uses the same basis class at %i visible images', (count) => {
      const { container } = renderWithIntl(
        <GalleryModule
          data={makeData({ layout: 'masonry', images: makeImages(count), maxVisible: 20 })}
          slug="tenant"
        />,
      );

      const tiles = container.querySelectorAll('a[data-gallery-url]');
      for (const tile of tiles) {
        expect(tile).toHaveClass('basis-[calc(50%-0.5rem)]');
        expect(tile).toHaveClass('sm:basis-[calc(33.333%-0.667rem)]');
      }
    });

    it('does not affect the grid layout, regardless of image count', () => {
      const { container } = renderWithIntl(
        <GalleryModule
          data={makeData({ layout: 'grid', images: makeImages(1), maxVisible: 6 })}
          slug="tenant"
        />,
      );

      expect(galleryGridContainer(container)).toHaveClass('grid-cols-2', 'sm:grid-cols-3');
      const tile = container.querySelector('a[data-gallery-url]');
      expect(tile).not.toHaveClass('basis-[calc(50%-0.5rem)]');
    });
  });

  // M18-S07 — "Destaque": 1 large + 4 small tiles, a fixed 5-image template.
  describe('layout: featured', () => {
    it('renders exactly 5 tiles at exactly 5 images', () => {
      const { container } = renderWithIntl(
        <GalleryModule
          data={makeData({ layout: 'featured', images: makeImages(5), maxVisible: 6 })}
          slug="tenant"
        />,
      );

      expect(container.querySelectorAll('a[data-gallery-url]')).toHaveLength(5);
    });

    it('places the first image in the "big" grid area, the rest in reading order', () => {
      const { container } = renderWithIntl(
        <GalleryModule
          data={makeData({ layout: 'featured', images: makeImages(5), maxVisible: 6 })}
          slug="tenant"
        />,
      );

      const tiles = container.querySelectorAll('a[data-gallery-url]');
      expect((tiles[0] as HTMLElement).style.gridArea).toBe('big');
      expect((tiles[1] as HTMLElement).style.gridArea).toBe('s1');
      expect((tiles[4] as HTMLElement).style.gridArea).toBe('s4');
    });

    it('defaults featuredPosition to "left" on the container when unset', () => {
      const { container } = renderWithIntl(
        <GalleryModule
          data={makeData({ layout: 'featured', images: makeImages(5), maxVisible: 6 })}
          slug="tenant"
        />,
      );

      expect(galleryGridContainer(container)).toHaveAttribute('data-featured-position', 'left');
    });

    it('reflects an explicit featuredPosition on the container', () => {
      const { container } = renderWithIntl(
        <GalleryModule
          data={makeData({
            layout: 'featured',
            images: makeImages(5),
            maxVisible: 6,
            featuredPosition: 'right',
          })}
          slug="tenant"
        />,
      );

      expect(galleryGridContainer(container)).toHaveAttribute('data-featured-position', 'right');
    });

    it('never renders a "Ver mais" button — GalleryGrid is still wrapped, but maxVisible/totalImages are both the effective count', () => {
      renderWithIntl(
        <GalleryModule
          data={makeData({ layout: 'featured', images: makeImages(5), maxVisible: 1 })}
          slug="tenant"
        />,
      );

      expect(screen.queryByRole('button', { name: 'Ver mais' })).not.toBeInTheDocument();
    });

    it('still opens the lightbox on tile click — confirms GalleryGrid is still wrapping, not skipped', async () => {
      const user = userEvent.setup();
      const { container } = renderWithIntl(
        <GalleryModule
          data={makeData({ layout: 'featured', images: makeImages(5), maxVisible: 6 })}
          slug="tenant"
        />,
      );

      await user.click(screen.getAllByRole('link')[0]);

      const dialog = container.querySelector('dialog');
      expect(dialog?.querySelector('img')).toHaveAttribute(
        'src',
        'https://storage.example.com/gallery/photo-0.jpg',
      );
    });

    it('falls back to rendering as grid when there are fewer than 5 images', () => {
      const { container } = renderWithIntl(
        <GalleryModule
          data={makeData({ layout: 'featured', images: makeImages(3), maxVisible: 6 })}
          slug="tenant"
        />,
      );

      expect(galleryGridContainer(container)).toHaveClass('grid-cols-2', 'sm:grid-cols-3');
      expect(galleryGridContainer(container)).not.toHaveClass('gallery-featured-grid');
    });

    it('renders as featured, using only the first 5, when there are more than 5 images', () => {
      const { container } = renderWithIntl(
        <GalleryModule
          data={makeData({ layout: 'featured', images: makeImages(7), maxVisible: 6 })}
          slug="tenant"
        />,
      );

      expect(galleryGridContainer(container)).toHaveClass('gallery-featured-grid');
      const tiles = container.querySelectorAll('a[data-gallery-url]');
      expect(tiles).toHaveLength(5);
      expect(tiles[0]).toHaveAttribute(
        'data-gallery-url',
        'https://storage.example.com/gallery/photo-0.jpg',
      );
      expect(tiles[4]).toHaveAttribute(
        'data-gallery-url',
        'https://storage.example.com/gallery/photo-4.jpg',
      );
    });
  });

  it("forwards layout to each GalleryItem, so a masonry tile sizes to the photo's own aspect ratio", () => {
    const { container } = renderWithIntl(
      <GalleryModule
        data={makeData({
          layout: 'masonry',
          images: [makeImage({ width: 400, height: 800 })],
        })}
        slug="tenant"
      />,
    );

    const wrapper = container.querySelector('img')?.parentElement;
    expect(wrapper).toHaveStyle({ aspectRatio: '400 / 800' });
  });

  it('renders the first image with loading="eager" (LCP) and subsequent ones with loading="lazy"', () => {
    const images = [
      makeImage(),
      makeImage({ url: 'https://storage.example.com/gallery/photo-2.jpg' }),
    ];
    const { container } = renderWithIntl(
      <GalleryModule data={makeData({ images })} slug="tenant" />,
    );

    const imgs = container.querySelectorAll('img');
    expect(imgs[0]).toHaveAttribute('src', 'https://storage.example.com/gallery/photo.jpg');
    expect(imgs[0]).toHaveAttribute('loading', 'eager');
    expect(imgs[1]).toHaveAttribute('loading', 'lazy');
  });

  it('renders all images in the DOM (SSR) and marks extras with data-gallery-extra', () => {
    const images = Array.from({ length: 8 }, (_, i) =>
      makeImage({ url: `https://storage.example.com/gallery/photo-${i}.jpg` }),
    );
    const { container } = renderWithIntl(
      <GalleryModule data={makeData({ images, maxVisible: 6 })} slug="tenant" />,
    );

    expect(container.querySelectorAll('img')).toHaveLength(8);
    expect(container.querySelectorAll('[data-gallery-extra]')).toHaveLength(2);
  });

  it('shows a "Ver mais" button when images.length > maxVisible', () => {
    const images = Array.from({ length: 8 }, (_, i) =>
      makeImage({ url: `https://storage.example.com/gallery/photo-${i}.jpg` }),
    );
    renderWithIntl(<GalleryModule data={makeData({ images, maxVisible: 6 })} slug="tenant" />);

    expect(screen.getByRole('button', { name: 'Ver mais' })).toBeInTheDocument();
  });

  it('sets data-gallery-expanded to true and removes "Ver mais" when clicked', async () => {
    const user = userEvent.setup();
    const images = Array.from({ length: 8 }, (_, i) =>
      makeImage({ url: `https://storage.example.com/gallery/photo-${i}.jpg` }),
    );
    const { container } = renderWithIntl(
      <GalleryModule data={makeData({ images, maxVisible: 6 })} slug="tenant" />,
    );

    await user.click(screen.getByRole('button', { name: 'Ver mais' }));

    expect(container.querySelector('[data-gallery-expanded]')).toHaveAttribute(
      'data-gallery-expanded',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Ver mais' })).not.toBeInTheDocument();
  });

  it('does not render a "Ver mais" button when images.length <= maxVisible', () => {
    renderWithIntl(
      <GalleryModule data={makeData({ images: [makeImage()], maxVisible: 6 })} slug="tenant" />,
    );

    expect(screen.queryByRole('button', { name: 'Ver mais' })).not.toBeInTheDocument();
  });

  it('opens the lightbox when a gallery image is clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(<GalleryModule data={makeData()} slug="tenant" />);

    await user.click(screen.getByRole('link'));

    const dialog = container.querySelector('dialog');
    expect(dialog?.querySelector('img')).toHaveAttribute(
      'src',
      'https://storage.example.com/gallery/photo.jpg',
    );
  });

  describe('photoType badges', () => {
    it('renders an "Antes" badge for source: booking + photoType: before', () => {
      renderWithIntl(
        <GalleryModule
          data={makeData({ images: [makeImage({ source: 'booking', photoType: 'before' })] })}
          slug="tenant"
        />,
      );

      expect(screen.getByText('Antes')).toBeInTheDocument();
    });

    it('renders a "Depois" badge for source: booking + photoType: after', () => {
      renderWithIntl(
        <GalleryModule
          data={makeData({ images: [makeImage({ source: 'booking', photoType: 'after' })] })}
          slug="tenant"
        />,
      );

      expect(screen.getByText('Depois')).toBeInTheDocument();
    });

    it('renders no badge when photoType is absent', () => {
      renderWithIntl(<GalleryModule data={makeData({ images: [makeImage()] })} slug="tenant" />);

      expect(screen.queryByText('Antes')).not.toBeInTheDocument();
      expect(screen.queryByText('Depois')).not.toBeInTheDocument();
    });
  });

  describe('eyebrow', () => {
    it('renders eyebrow when provided', () => {
      renderWithIntl(
        <GalleryModule data={makeData({ eyebrow: 'Resultados reais' })} slug="tenant" />,
      );

      expect(screen.getByTestId('section-eyebrow')).toHaveTextContent('Resultados reais');
    });

    it('does not render eyebrow when absent', () => {
      const { container } = renderWithIntl(<GalleryModule data={makeData()} slug="tenant" />);

      expect(container.querySelector('[data-testid="section-eyebrow"]')).not.toBeInTheDocument();
    });
  });

  it('has no axe violations', async () => {
    const { container } = renderWithIntl(<GalleryModule data={makeData()} slug="tenant" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
