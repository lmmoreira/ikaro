// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingDetailAsideCard } from './BookingDetailAsideCard';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function makeBooking(overrides?: Partial<StaffBookingDetailResponse>): StaffBookingDetailResponse {
  return {
    bookingId: 'b-1',
    status: 'PENDING',
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
        priceAtBooking: { amount: 100, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 5,
        requiresPickupAddressAtBooking: false,
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    totalDurationMins: 30,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    beforeServicePhotoPaths: [],
    afterServicePhotoPaths: [],
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    completedAt: null,
    rejectionReason: null,
    ...overrides,
  };
}

function baseProps(overrides: Partial<Parameters<typeof BookingDetailAsideCard>[0]> = {}) {
  return {
    actionState: 'idle' as const,
    booking: makeBooking(),
    backHref: '/dashboard/bookings',
    onBackWithoutApprove: vi.fn(),
    onOpenComplete: vi.fn(),
    onOpenReschedule: vi.fn(),
    onOpenCancel: vi.fn(),
    onApprove: vi.fn(),
    onOpenReject: vi.fn(),
    onOpenRequestInfo: vi.fn(),
    ...overrides,
  };
}

describe('BookingDetailAsideCard', () => {
  it('renders the back-to-agenda card when actionState is approved', () => {
    renderWithIntl(<BookingDetailAsideCard {...baseProps({ actionState: 'approved' })} />);

    expect(screen.getByRole('link', { name: 'Voltar à agenda' })).toHaveAttribute(
      'href',
      '/dashboard/bookings',
    );
  });

  it('calls onBackWithoutApprove when the slot-conflict back button is clicked', async () => {
    const user = userEvent.setup();
    const onBackWithoutApprove = vi.fn();
    renderWithIntl(
      <BookingDetailAsideCard
        {...baseProps({ actionState: 'slot-conflict', onBackWithoutApprove })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Voltar/ }));

    expect(onBackWithoutApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onApprove when the approve button is clicked for a triage (idle) booking', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    renderWithIntl(<BookingDetailAsideCard {...baseProps({ onApprove })} />);

    await user.click(screen.getByRole('button', { name: 'Aprovar' }));

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenComplete/onOpenReschedule/onOpenCancel for an approved booking', async () => {
    const user = userEvent.setup();
    const onOpenComplete = vi.fn();
    renderWithIntl(
      <BookingDetailAsideCard
        {...baseProps({ booking: makeBooking({ status: 'APPROVED' }), onOpenComplete })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Marcar concluído' }));

    expect(onOpenComplete).toHaveBeenCalledTimes(1);
  });

  it('renders nothing for a rejected or cancelled (non-actionState) booking', () => {
    const { container } = renderWithIntl(
      <BookingDetailAsideCard {...baseProps({ booking: makeBooking({ status: 'REJECTED' }) })} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
