// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GalleryImage } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { GalleryItem } from './GalleryItem';

function makeImage(overrides?: Partial<GalleryImage>): GalleryImage {
  return {
    url: 'https://storage.example.com/gallery/photo.jpg',
    source: 'upload',
    ...overrides,
  };
}

describe('GalleryItem', () => {
  it('renders a fixed square box for layout: grid, regardless of width/height', () => {
    const { container } = renderWithIntl(
      <GalleryItem image={makeImage({ width: 400, height: 900 })} layout="grid" />,
    );

    const wrapper = container.querySelector('img')?.parentElement;
    expect(wrapper).toHaveClass('aspect-square');
    expect(wrapper?.style.aspectRatio).toBe('');
  });

  it("sizes the tile to the photo's own aspect ratio for layout: masonry with width/height", () => {
    const { container } = renderWithIntl(
      <GalleryItem image={makeImage({ width: 400, height: 900 })} layout="masonry" />,
    );

    const wrapper = container.querySelector('img')?.parentElement;
    expect(wrapper).not.toHaveClass('aspect-square');
    expect(wrapper).toHaveStyle({ aspectRatio: '400 / 900' });
  });

  it('falls back to the fixed square box for layout: masonry when width and height are both missing', () => {
    const { container } = renderWithIntl(<GalleryItem image={makeImage()} layout="masonry" />);

    const wrapper = container.querySelector('img')?.parentElement;
    expect(wrapper).toHaveClass('aspect-square');
  });

  it('falls back to the fixed square box for layout: masonry when only one dimension is present', () => {
    const { container } = renderWithIntl(
      <GalleryItem image={makeImage({ width: 400 })} layout="masonry" />,
    );

    const wrapper = container.querySelector('img')?.parentElement;
    expect(wrapper).toHaveClass('aspect-square');
  });

  it('fills its parent grid cell for layout: featured, imposing no box of its own (M18-S07)', () => {
    const { container } = renderWithIntl(
      <GalleryItem image={makeImage({ width: 400, height: 900 })} layout="featured" />,
    );

    const wrapper = container.querySelector('img')?.parentElement;
    expect(wrapper).toHaveClass('h-full');
    expect(wrapper).toHaveClass('w-full');
    expect(wrapper).not.toHaveClass('aspect-square');
    expect(wrapper?.style.aspectRatio).toBe('');
  });

  it('fills its parent grid cell for layout: featured even with no width/height captured', () => {
    const { container } = renderWithIntl(<GalleryItem image={makeImage()} layout="featured" />);

    const wrapper = container.querySelector('img')?.parentElement;
    expect(wrapper).toHaveClass('h-full');
    expect(wrapper).toHaveClass('w-full');
  });

  it('renders the "Antes" badge for photoType: before', () => {
    renderWithIntl(
      <GalleryItem image={makeImage({ source: 'booking', photoType: 'before' })} layout="grid" />,
    );

    expect(screen.getByText('Antes')).toBeInTheDocument();
  });

  it('renders the "Depois" badge for photoType: after', () => {
    renderWithIntl(
      <GalleryItem image={makeImage({ source: 'booking', photoType: 'after' })} layout="grid" />,
    );

    expect(screen.getByText('Depois')).toBeInTheDocument();
  });

  it('renders no badge when photoType is absent', () => {
    renderWithIntl(<GalleryItem image={makeImage()} layout="grid" />);

    expect(screen.queryByText('Antes')).not.toBeInTheDocument();
    expect(screen.queryByText('Depois')).not.toBeInTheDocument();
  });

  it('renders the caption when present', () => {
    renderWithIntl(
      <GalleryItem image={makeImage({ caption: 'Legenda de teste' })} layout="grid" />,
    );

    expect(screen.getByText('Legenda de teste')).toBeInTheDocument();
  });

  // Codex review, PR #329: a single fixed `sizes` value for every layout under/over-fetched the
  // featured layout's asymmetric tiles (the big tile is ~50vw/100vw, the 4 small ones ~25vw/50vw —
  // neither matches grid/masonry's own 33vw/50vw/100vw split).
  describe('sizes', () => {
    it('uses the grid/masonry value for layout: grid, ignoring isFeaturedPrimary', () => {
      const { container } = renderWithIntl(
        <GalleryItem image={makeImage()} layout="grid" isFeaturedPrimary />,
      );

      expect(container.querySelector('img')).toHaveAttribute(
        'sizes',
        '(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw',
      );
    });

    it('uses the primary-tile value for layout: featured when isFeaturedPrimary is true', () => {
      const { container } = renderWithIntl(
        <GalleryItem image={makeImage()} layout="featured" isFeaturedPrimary />,
      );

      expect(container.querySelector('img')).toHaveAttribute(
        'sizes',
        '(min-width: 640px) 50vw, 100vw',
      );
    });

    it('uses the small-tile value for layout: featured when isFeaturedPrimary is false or absent', () => {
      const { container } = renderWithIntl(<GalleryItem image={makeImage()} layout="featured" />);

      expect(container.querySelector('img')).toHaveAttribute(
        'sizes',
        '(min-width: 640px) 25vw, 50vw',
      );
    });
  });

  it('marks the image as loading="eager" when priority is set, "lazy" otherwise', () => {
    const { container: eager } = renderWithIntl(
      <GalleryItem image={makeImage()} layout="grid" priority />,
    );
    expect(eager.querySelector('img')).toHaveAttribute('loading', 'eager');

    const { container: lazy } = renderWithIntl(<GalleryItem image={makeImage()} layout="grid" />);
    expect(lazy.querySelector('img')).toHaveAttribute('loading', 'lazy');
  });
});
