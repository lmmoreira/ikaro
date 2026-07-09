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

vi.mock('@/features/booking/api/staff', () => ({
  listBookings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 }),
  getBooking: vi.fn(),
}));

const GALLERY: GalleryModuleData = { images: [], layout: 'grid', maxVisible: 6 };

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
});
