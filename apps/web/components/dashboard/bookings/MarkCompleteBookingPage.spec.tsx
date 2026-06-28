// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { MarkCompleteBookingPage } from './MarkCompleteBookingPage';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const completeBookingMutateAsync = vi.hoisted(() => vi.fn());
const setBookingStatus = vi.hoisted(() => vi.fn());

vi.mock('@/lib/hooks/useBookingMutations', () => ({
  useCompleteBooking: () => ({ mutateAsync: completeBookingMutateAsync, isPending: false }),
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
      {
        lineId: 'l-2',
        serviceId: 'svc-2',
        serviceName: 'Cera',
        priceAtBooking: { amount: 40, currency: 'BRL' },
        durationMinsAtBooking: 20,
        pointsValueAtBooking: 3,
        requiresPickupAddressAtBooking: false,
      },
    ],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 50,
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
  completeBookingMutateAsync.mockReset();
  setBookingStatus.mockReset();
});

describe('MarkCompleteBookingPage', () => {
  it('submits the charged amounts and shows the success state', async () => {
    const user = userEvent.setup();
    completeBookingMutateAsync.mockResolvedValue(undefined);

    renderWithIntl(
      <MarkCompleteBookingPage booking={makeBooking()} backHref="/dashboard/bookings/b-1" />,
    );

    expect(setBookingStatus).toHaveBeenCalledWith('APPROVED');
    await user.clear(screen.getAllByRole('spinbutton')[0]);
    await user.type(screen.getAllByRole('spinbutton')[0], '70');
    await user.click(screen.getAllByRole('button', { name: 'Confirmar conclusão' })[0]);

    expect(completeBookingMutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: {
        lines: [
          { lineId: 'l-1', actualPriceCharged: 70 },
          { lineId: 'l-2', actualPriceCharged: 40 },
        ],
      },
    });
    expect(await screen.findByText('Serviço concluído')).toBeInTheDocument();
    expect(setBookingStatus).toHaveBeenCalledWith('COMPLETED');
  });
});
