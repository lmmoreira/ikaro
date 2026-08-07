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

  it('marks the image as loading="eager" when priority is set, "lazy" otherwise', () => {
    const { container: eager } = renderWithIntl(
      <GalleryItem image={makeImage()} layout="grid" priority />,
    );
    expect(eager.querySelector('img')).toHaveAttribute('loading', 'eager');

    const { container: lazy } = renderWithIntl(<GalleryItem image={makeImage()} layout="grid" />);
    expect(lazy.querySelector('img')).toHaveAttribute('loading', 'lazy');
  });
});
