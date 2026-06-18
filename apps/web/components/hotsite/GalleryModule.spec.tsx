// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { GalleryImage, GalleryModuleData } from '@ikaro/types';
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

describe('GalleryModule', () => {
  it('renders the default title when none is provided', () => {
    render(<GalleryModule data={makeData()} slug="tenant" />);

    expect(screen.getByRole('heading', { name: 'Nossos Resultados' })).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    render(<GalleryModule data={makeData({ title: 'Galeria de Fotos' })} slug="tenant" />);

    expect(screen.getByRole('heading', { name: 'Galeria de Fotos' })).toBeInTheDocument();
  });

  it('renders nothing when images is empty', () => {
    const { container } = render(<GalleryModule data={makeData({ images: [] })} slug="tenant" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a grid layout container for layout: grid', () => {
    const { container } = render(
      <GalleryModule data={makeData({ layout: 'grid' })} slug="tenant" />,
    );

    expect(container.querySelector('.grid')).toBeInTheDocument();
  });

  it('renders a CSS-columns container for layout: masonry', () => {
    const { container } = render(
      <GalleryModule data={makeData({ layout: 'masonry' })} slug="tenant" />,
    );

    expect(container.querySelector('.columns-2')).toBeInTheDocument();
  });

  it('renders the first image with loading="eager" (LCP) and subsequent ones with loading="lazy"', () => {
    const images = [
      makeImage(),
      makeImage({ url: 'https://storage.example.com/gallery/photo-2.jpg' }),
    ];
    const { container } = render(<GalleryModule data={makeData({ images })} slug="tenant" />);

    const imgs = container.querySelectorAll('img');
    expect(imgs[0]).toHaveAttribute('src', 'https://storage.example.com/gallery/photo.jpg');
    expect(imgs[0]).toHaveAttribute('loading', 'eager');
    expect(imgs[1]).toHaveAttribute('loading', 'lazy');
  });

  it('renders all images in the DOM (SSR) and marks extras with data-gallery-extra', () => {
    const images = Array.from({ length: 8 }, (_, i) =>
      makeImage({ url: `https://storage.example.com/gallery/photo-${i}.jpg` }),
    );
    const { container } = render(
      <GalleryModule data={makeData({ images, maxVisible: 6 })} slug="tenant" />,
    );

    expect(container.querySelectorAll('img')).toHaveLength(8);
    expect(container.querySelectorAll('[data-gallery-extra]')).toHaveLength(2);
  });

  it('shows a "Ver mais" button when images.length > maxVisible', () => {
    const images = Array.from({ length: 8 }, (_, i) =>
      makeImage({ url: `https://storage.example.com/gallery/photo-${i}.jpg` }),
    );
    render(<GalleryModule data={makeData({ images, maxVisible: 6 })} slug="tenant" />);

    expect(screen.getByRole('button', { name: 'Ver mais' })).toBeInTheDocument();
  });

  it('sets data-gallery-expanded to true and removes "Ver mais" when clicked', async () => {
    const user = userEvent.setup();
    const images = Array.from({ length: 8 }, (_, i) =>
      makeImage({ url: `https://storage.example.com/gallery/photo-${i}.jpg` }),
    );
    const { container } = render(
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
    render(
      <GalleryModule data={makeData({ images: [makeImage()], maxVisible: 6 })} slug="tenant" />,
    );

    expect(screen.queryByRole('button', { name: 'Ver mais' })).not.toBeInTheDocument();
  });

  it('opens the lightbox when a gallery image is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<GalleryModule data={makeData()} slug="tenant" />);

    await user.click(screen.getByRole('link'));

    const dialog = container.querySelector('dialog');
    expect(dialog?.querySelector('img')).toHaveAttribute(
      'src',
      'https://storage.example.com/gallery/photo.jpg',
    );
  });

  describe('photoType badges', () => {
    it('renders an "Antes" badge for source: booking + photoType: before', () => {
      render(
        <GalleryModule
          data={makeData({ images: [makeImage({ source: 'booking', photoType: 'before' })] })}
          slug="tenant"
        />,
      );

      expect(screen.getByText('Antes')).toBeInTheDocument();
    });

    it('renders a "Depois" badge for source: booking + photoType: after', () => {
      render(
        <GalleryModule
          data={makeData({ images: [makeImage({ source: 'booking', photoType: 'after' })] })}
          slug="tenant"
        />,
      );

      expect(screen.getByText('Depois')).toBeInTheDocument();
    });

    it('renders no badge when photoType is absent', () => {
      render(<GalleryModule data={makeData({ images: [makeImage()] })} slug="tenant" />);

      expect(screen.queryByText('Antes')).not.toBeInTheDocument();
      expect(screen.queryByText('Depois')).not.toBeInTheDocument();
    });
  });

  describe('eyebrow', () => {
    it('renders eyebrow when provided', () => {
      render(<GalleryModule data={makeData({ eyebrow: 'Resultados reais' })} slug="tenant" />);

      expect(screen.getByTestId('section-eyebrow')).toHaveTextContent('Resultados reais');
    });

    it('does not render eyebrow when absent', () => {
      const { container } = render(<GalleryModule data={makeData()} slug="tenant" />);

      expect(container.querySelector('[data-testid="section-eyebrow"]')).not.toBeInTheDocument();
    });
  });
});
