// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse, StaffBookingListResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { getBooking, listBookings } from '@/features/booking/api/staff';
import { featureBookingPhoto } from '@/features/platform/api/tenant-settings';
import { ApiError } from '@/shared/lib/api/errors';
import { BookingPhotoPicker } from './BookingPhotoPicker';

vi.mock('@/features/booking/api/staff', () => ({
  listBookings: vi.fn(),
  getBooking: vi.fn(),
}));

vi.mock('@/features/platform/api/tenant-settings', () => ({
  featureBookingPhoto: vi.fn(),
}));

const LIST_RESPONSE: StaffBookingListResponse = {
  items: [
    {
      bookingId: 'b-1',
      status: 'COMPLETED',
      scheduledAt: '2026-06-01T10:00:00.000Z',
      contactName: 'João Silva',
      serviceNames: ['Lavagem'],
      totalPrice: { amount: 50, currency: 'BRL' },
      totalDurationMins: 30,
      isCustomer: true,
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
};

const DETAIL_RESPONSE: Partial<StaffBookingDetailResponse> = {
  beforeServicePhotoUrls: ['https://cdn.example.com/before-1.jpg'],
  afterServicePhotoUrls: ['https://cdn.example.com/after-1.jpg'],
  beforeServicePhotoPaths: ['tenants/tenant-1/bookings/b-1/before-1.jpg'],
  afterServicePhotoPaths: ['tenants/tenant-1/bookings/b-1/after-1.jpg'],
};

describe('BookingPhotoPicker', () => {
  afterEach(() => {
    vi.mocked(listBookings).mockReset();
    vi.mocked(getBooking).mockReset();
    vi.mocked(featureBookingPhoto).mockReset();
  });

  it('lists completed bookings and requests status=COMPLETED', async () => {
    vi.mocked(listBookings).mockResolvedValue(LIST_RESPONSE);

    renderWithIntl(<BookingPhotoPicker onPick={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByTestId('booking-photo-picker-select')).toBeInTheDocument();
    expect(listBookings).toHaveBeenCalledWith({ status: 'COMPLETED', limit: 50 });
    expect(screen.getByText('João Silva', { exact: false })).toBeInTheDocument();
  });

  it('shows an empty message when there are no completed bookings', async () => {
    vi.mocked(listBookings).mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });

    renderWithIntl(<BookingPhotoPicker onPick={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText(/nenhum agendamento/i)).toBeInTheDocument();
  });

  it('selecting a booking loads its photos and picking one calls featureBookingPhoto with the raw path', async () => {
    const user = userEvent.setup();
    vi.mocked(listBookings).mockResolvedValue(LIST_RESPONSE);
    vi.mocked(getBooking).mockResolvedValue(DETAIL_RESPONSE as StaffBookingDetailResponse);
    vi.mocked(featureBookingPhoto).mockResolvedValue({
      filePath: 'tenants/tenant-1/hotsite/gallery/g1/before-1.jpg',
      url: 'https://public.storage.example.com/tenants/tenant-1/hotsite/gallery/g1/before-1.jpg',
      photoType: 'before',
    });
    const onPick = vi.fn();

    renderWithIntl(<BookingPhotoPicker onPick={onPick} onClose={vi.fn()} />);

    await screen.findByTestId('booking-photo-picker-select');
    await user.selectOptions(screen.getByTestId('booking-photo-picker-select'), 'b-1');

    const grid = await screen.findByTestId('booking-photo-picker-grid');
    const beforeThumb = grid.querySelector('img[src="https://cdn.example.com/before-1.jpg"]');
    expect(beforeThumb).not.toBeNull();
    await user.click(beforeThumb!.closest('button')!);

    await waitFor(() => {
      expect(featureBookingPhoto).toHaveBeenCalledWith({
        bookingId: 'b-1',
        photoType: 'before',
        filePath: 'tenants/tenant-1/bookings/b-1/before-1.jpg',
      });
    });
    expect(onPick).toHaveBeenCalledWith(
      {
        url: 'tenants/tenant-1/hotsite/gallery/g1/before-1.jpg',
        source: 'booking',
        bookingId: 'b-1',
        photoType: 'before',
      },
      'https://public.storage.example.com/tenants/tenant-1/hotsite/gallery/g1/before-1.jpg',
    );
  });

  it('shows the specific translated message when featureBookingPhoto fails with a known code, without calling onPick', async () => {
    const user = userEvent.setup();
    vi.mocked(listBookings).mockResolvedValue(LIST_RESPONSE);
    vi.mocked(getBooking).mockResolvedValue(DETAIL_RESPONSE as StaffBookingDetailResponse);
    vi.mocked(featureBookingPhoto).mockRejectedValue(
      new ApiError(422, 'Mismatch', { code: 'PLATFORM_FEATURED_PHOTO_PATH_MISMATCH' }),
    );
    const onPick = vi.fn();

    renderWithIntl(<BookingPhotoPicker onPick={onPick} onClose={vi.fn()} />);

    await screen.findByTestId('booking-photo-picker-select');
    await user.selectOptions(screen.getByTestId('booking-photo-picker-select'), 'b-1');

    const grid = await screen.findByTestId('booking-photo-picker-grid');
    const beforeThumb = grid.querySelector('img[src="https://cdn.example.com/before-1.jpg"]');
    await user.click(beforeThumb!.closest('button')!);

    expect(await screen.findByTestId('booking-photo-picker-error')).toHaveTextContent(
      'A foto não pertence ao agendamento informado.',
    );
    expect(onPick).not.toHaveBeenCalled();
  });

  it('shows the empty message when listBookings rejects', async () => {
    vi.mocked(listBookings).mockRejectedValue(new Error('network error'));

    renderWithIntl(<BookingPhotoPicker onPick={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText(/nenhum agendamento/i)).toBeInTheDocument();
  });

  it('picking an "after" photo calls featureBookingPhoto with photoType "after"', async () => {
    const user = userEvent.setup();
    vi.mocked(listBookings).mockResolvedValue(LIST_RESPONSE);
    vi.mocked(getBooking).mockResolvedValue(DETAIL_RESPONSE as StaffBookingDetailResponse);
    vi.mocked(featureBookingPhoto).mockResolvedValue({
      filePath: 'tenants/tenant-1/hotsite/gallery/g1/after-1.jpg',
      url: 'https://public.storage.example.com/tenants/tenant-1/hotsite/gallery/g1/after-1.jpg',
      photoType: 'after',
    });
    const onPick = vi.fn();

    renderWithIntl(<BookingPhotoPicker onPick={onPick} onClose={vi.fn()} />);

    await screen.findByTestId('booking-photo-picker-select');
    await user.selectOptions(screen.getByTestId('booking-photo-picker-select'), 'b-1');

    const grid = await screen.findByTestId('booking-photo-picker-grid');
    const afterThumb = grid.querySelector('img[src="https://cdn.example.com/after-1.jpg"]');
    expect(afterThumb).not.toBeNull();
    await user.click(afterThumb!.closest('button')!);

    await waitFor(() => {
      expect(featureBookingPhoto).toHaveBeenCalledWith({
        bookingId: 'b-1',
        photoType: 'after',
        filePath: 'tenants/tenant-1/bookings/b-1/after-1.jpg',
      });
    });
    expect(onPick).toHaveBeenCalledWith(
      {
        url: 'tenants/tenant-1/hotsite/gallery/g1/after-1.jpg',
        source: 'booking',
        bookingId: 'b-1',
        photoType: 'after',
      },
      'https://public.storage.example.com/tenants/tenant-1/hotsite/gallery/g1/after-1.jpg',
    );
  });

  it('shows no photos when getBooking rejects for the selected booking', async () => {
    const user = userEvent.setup();
    vi.mocked(listBookings).mockResolvedValue(LIST_RESPONSE);
    vi.mocked(getBooking).mockRejectedValue(new Error('not found'));

    renderWithIntl(<BookingPhotoPicker onPick={vi.fn()} onClose={vi.fn()} />);

    await screen.findByTestId('booking-photo-picker-select');
    await user.selectOptions(screen.getByTestId('booking-photo-picker-select'), 'b-1');

    expect(await screen.findByText('Este agendamento não tem fotos.')).toBeInTheDocument();
    expect(screen.queryByTestId('booking-photo-picker-grid')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(listBookings).mockResolvedValue(LIST_RESPONSE);
    const onClose = vi.fn();

    renderWithIntl(<BookingPhotoPicker onPick={vi.fn()} onClose={onClose} />);

    await user.click(screen.getByTestId('booking-photo-picker-close'));

    expect(onClose).toHaveBeenCalled();
  });
});
