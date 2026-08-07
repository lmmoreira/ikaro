// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GalleryModuleData } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { GalleryConfigPanel } from './GalleryConfigPanel';
import { writeModuleData } from './module-config-panel.types';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

vi.mock('@/features/booking/api/booking', () => ({
  listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
  getBooking: vi.fn(),
}));

const GALLERY: GalleryModuleData = { images: [], layout: 'grid', maxVisible: 6 };

const FIVE_IMAGES = Array.from({ length: 5 }, (_, i) => ({
  url: `https://storage.example.com/gallery/photo-${i}.jpg`,
  source: 'upload' as const,
}));

describe('GalleryConfigPanel', () => {
  it('renders current values', () => {
    renderWithIntl(<GalleryConfigPanel data={writeModuleData(GALLERY)} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue('6')).toBeInTheDocument();
    expect(screen.getByTestId('gallery-layout-grid')).toHaveAttribute('aria-checked', 'true');
  });

  it('editing maxVisible calls onChange with the parsed number', () => {
    const onChange = vi.fn();

    renderWithIntl(<GalleryConfigPanel data={writeModuleData(GALLERY)} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Máximo de imagens visíveis'), {
      target: { value: '9' },
    });

    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...GALLERY, maxVisible: 9 }));
  });

  it('renders the GalleryImageManager for the images field', () => {
    renderWithIntl(<GalleryConfigPanel data={writeModuleData(GALLERY)} onChange={vi.fn()} />);

    expect(screen.getByTestId('gallery-empty')).toBeInTheDocument();
    expect(screen.getByTestId('gallery-open-picker')).toBeInTheDocument();
  });

  it('editing title and eyebrow each update only their own field', () => {
    const onChange = vi.fn();

    renderWithIntl(<GalleryConfigPanel data={writeModuleData(GALLERY)} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Título (opcional)'), { target: { value: 'T' } });
    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...GALLERY, title: 'T' }));

    fireEvent.change(screen.getByLabelText('Texto de destaque (opcional)'), {
      target: { value: 'E' },
    });
    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...GALLERY, eyebrow: 'E' }));
  });

  it('changing the layout pill calls onChange with the new layout', () => {
    const onChange = vi.fn();

    renderWithIntl(<GalleryConfigPanel data={writeModuleData(GALLERY)} onChange={onChange} />);

    fireEvent.click(screen.getByTestId('gallery-layout-masonry'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...GALLERY, layout: 'masonry' }));
  });

  describe('"Destaque" layout (M18-S07)', () => {
    it('disables the "Destaque" pill and shows the "requires at least 5" hint below 5 images', () => {
      renderWithIntl(<GalleryConfigPanel data={writeModuleData(GALLERY)} onChange={vi.fn()} />);

      expect(screen.getByTestId('gallery-layout-featured')).toBeDisabled();
      expect(screen.getByText('Este layout exige pelo menos 5 imagens.')).toBeInTheDocument();
    });

    it('enables the "Destaque" pill and hides the "requires at least 5" hint at exactly 5 images', () => {
      renderWithIntl(
        <GalleryConfigPanel
          data={writeModuleData({ ...GALLERY, images: FIVE_IMAGES })}
          onChange={vi.fn()}
        />,
      );

      expect(screen.getByTestId('gallery-layout-featured')).not.toBeDisabled();
      expect(screen.queryByText('Este layout exige pelo menos 5 imagens.')).not.toBeInTheDocument();
    });

    it('enables the "Destaque" pill at more than 5 images too — extras are just ignored, not blocked', () => {
      renderWithIntl(
        <GalleryConfigPanel
          data={writeModuleData({
            ...GALLERY,
            images: [...FIVE_IMAGES, ...FIVE_IMAGES.slice(0, 2)],
          })}
          onChange={vi.fn()}
        />,
      );

      expect(screen.getByTestId('gallery-layout-featured')).not.toBeDisabled();
    });

    it('shows the "uses only the first 5" note once layout is "featured" with more than 5 images', () => {
      renderWithIntl(
        <GalleryConfigPanel
          data={writeModuleData({
            ...GALLERY,
            images: [...FIVE_IMAGES, ...FIVE_IMAGES.slice(0, 2)],
            layout: 'featured',
          })}
          onChange={vi.fn()}
        />,
      );

      expect(
        screen.getByText('Este layout usa apenas as 5 primeiras imagens.'),
      ).toBeInTheDocument();
    });

    it('does not show the "uses only the first 5" note at exactly 5 images', () => {
      renderWithIntl(
        <GalleryConfigPanel
          data={writeModuleData({ ...GALLERY, images: FIVE_IMAGES, layout: 'featured' })}
          onChange={vi.fn()}
        />,
      );

      expect(
        screen.queryByText('Este layout usa apenas as 5 primeiras imagens.'),
      ).not.toBeInTheDocument();
    });

    it('does not show the "uses only the first 5" note when layout is not "featured", even with more than 5 images', () => {
      renderWithIntl(
        <GalleryConfigPanel
          data={writeModuleData({
            ...GALLERY,
            images: [...FIVE_IMAGES, ...FIVE_IMAGES.slice(0, 2)],
            layout: 'grid',
          })}
          onChange={vi.fn()}
        />,
      );

      expect(
        screen.queryByText('Este layout usa apenas as 5 primeiras imagens.'),
      ).not.toBeInTheDocument();
    });

    it('does not call onChange when clicking the disabled "Destaque" pill', () => {
      const onChange = vi.fn();
      renderWithIntl(<GalleryConfigPanel data={writeModuleData(GALLERY)} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('gallery-layout-featured'));

      expect(onChange).not.toHaveBeenCalled();
    });

    it('does not render the position pill unless layout is "featured"', () => {
      renderWithIntl(
        <GalleryConfigPanel
          data={writeModuleData({ ...GALLERY, images: FIVE_IMAGES })}
          onChange={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('gallery-featured-position-left')).not.toBeInTheDocument();
    });

    it('renders the position pill, defaulting to "left", once layout is "featured"', () => {
      renderWithIntl(
        <GalleryConfigPanel
          data={writeModuleData({ ...GALLERY, images: FIVE_IMAGES, layout: 'featured' })}
          onChange={vi.fn()}
        />,
      );

      expect(screen.getByTestId('gallery-featured-position-left')).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('changing the position pill calls onChange with the new featuredPosition', () => {
      const onChange = vi.fn();
      const data: GalleryModuleData = { ...GALLERY, images: FIVE_IMAGES, layout: 'featured' };

      renderWithIntl(<GalleryConfigPanel data={writeModuleData(data)} onChange={onChange} />);

      fireEvent.click(screen.getByTestId('gallery-featured-position-right'));

      expect(onChange).toHaveBeenCalledWith(
        writeModuleData({ ...data, featuredPosition: 'right' }),
      );
    });
  });
});
