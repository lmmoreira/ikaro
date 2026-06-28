// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RescheduleBookingPage } from './RescheduleBookingPage';

vi.mock('@/components/booking/AvailabilityCarousel', () => ({
  AvailabilityCarousel: ({ onSelectDate }: { readonly onSelectDate: (date: string) => void }) => (
    <button type="button" onClick={() => onSelectDate('2026-06-17')}>
      choose date
    </button>
  ),
}));

vi.mock('@/components/booking/SlotPicker', () => ({
  SlotPicker: ({
    onSelectSlot,
  }: {
    readonly onSelectSlot: (slot: { startsAt: string; endsAt: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSelectSlot({
          startsAt: '2026-06-17T10:00:00.000Z',
          endsAt: '2026-06-17T10:30:00.000Z',
        })
      }
    >
      choose slot
    </button>
  ),
}));

vi.mock('@/lib/api/schedule', () => ({
  fetchAvailability: vi.fn(),
}));

const rescheduleBookingMutateAsync = vi.hoisted(() => vi.fn());
const setBookingStatus = vi.hoisted(() => vi.fn());

vi.mock('@/lib/hooks/useBookingMutations', () => ({
  useRescheduleBooking: () => ({
    mutateAsync: rescheduleBookingMutateAsync,
    isPending: false,
  }),
}));

vi.mock('../topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    bookingStatus: null,
    setBookingStatus,
  }),
}));

function makeBooking(): StaffBookingDetailResponse {
  return {
    bookingId: 'b-1',
    status: 'APPROVED',
    scheduledAt: '2026-06-16T10:00:00.000Z',
    type: 'CUSTOMER',
    contactName: 'João Silva',
    contactEmail: 'joao@example.com',
    contactPhone: '+5531999999999',
    contactAddress: null,
    pickupAddress: null,
    customerId: 'c-1',
    loyaltyBalance: 240,
    lines: [
      {
        lineId: 'l-1',
        serviceId: 'svc-1',
        serviceName: 'Lavagem Simples',
        priceAtBooking: { amount: 60, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 5,
        requiresPickupAddressAtBooking: false,
      },
    ],
    totalPrice: { amount: 60, currency: 'BRL' },
    totalDurationMins: 30,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    rejectionReason: null,
  };
}

beforeEach(() => {
  rescheduleBookingMutateAsync.mockReset();
  setBookingStatus.mockReset();
});

describe('RescheduleBookingPage', () => {
  it('submits the selected new slot and shows the success state', async () => {
    const user = userEvent.setup();
    rescheduleBookingMutateAsync.mockResolvedValue(undefined);

    renderWithIntl(
      <RescheduleBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        backHref="/dashboard/bookings/b-1"
      />,
    );

    expect(setBookingStatus).toHaveBeenCalledWith('APPROVED');
    await user.click(screen.getByRole('button', { name: 'choose date' }));
    await user.click(screen.getByRole('button', { name: 'choose slot' }));
    await user.click(screen.getAllByRole('button', { name: 'Reagendar' })[0]);

    expect(rescheduleBookingMutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: { scheduledAt: '2026-06-17T10:00:00.000Z' },
    });
    expect(await screen.findByText('Agendamento reagendado')).toBeInTheDocument();
    expect(setBookingStatus).toHaveBeenCalledWith('APPROVED');
  });
});
