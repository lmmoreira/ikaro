// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingOutcomeLayout } from './BookingOutcomeLayout';

function makeBooking(overrides?: Partial<StaffBookingDetailResponse>): StaffBookingDetailResponse {
  return {
    bookingId: 'b-1',
    status: 'COMPLETED',
    scheduledAt: '2026-06-16T10:00:00.000Z',
    type: 'CUSTOMER',
    contactName: 'João Silva',
    contactEmail: 'joao@example.com',
    contactPhone: '+5531999999999',
    contactAddress: null,
    pickupAddress: null,
    customerId: 'c-1',
    loyaltyBalance: 240,
    lines: [],
    totalPrice: { amount: 0, currency: 'BRL' },
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    totalDurationMins: 0,
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

describe('BookingOutcomeLayout', () => {
  it('renders the banner title/body and aside body', () => {
    renderWithIntl(
      <BookingOutcomeLayout
        booking={makeBooking()}
        bannerTitle="Agendamento concluído"
        bannerBody="O serviço foi finalizado."
        asideBody="Próximos passos"
        primaryAction={{ label: 'Ver agendamentos', href: '/dashboard/bookings' }}
      />,
    );

    expect(screen.getByTestId('outcome-banner-title')).toHaveTextContent('Agendamento concluído');
    expect(screen.getByText('O serviço foi finalizado.')).toBeInTheDocument();
    // asideBody lives inside BookingOutcomeActionRail's `children`, rendered twice (desktop aside
    // + mobile fixed bar).
    expect(screen.getAllByText('Próximos passos')).toHaveLength(2);
  });

  it('renders the primary action as a link to its href', () => {
    // BookingOutcomeActionRail renders `children` twice (a desktop <aside> and a mobile fixed
    // bottom bar, visibility controlled by CSS) — every action link appears twice in the DOM.
    renderWithIntl(
      <BookingOutcomeLayout
        booking={makeBooking()}
        bannerTitle="title"
        bannerBody="body"
        asideBody="aside"
        primaryAction={{ label: 'Ver agendamentos', href: '/dashboard/bookings' }}
      />,
    );

    const links = screen.getAllByRole('link', { name: 'Ver agendamentos' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/dashboard/bookings');
    }
  });

  it('does not render a secondary action when none is provided', () => {
    renderWithIntl(
      <BookingOutcomeLayout
        booking={makeBooking()}
        bannerTitle="title"
        bannerBody="body"
        asideBody="aside"
        primaryAction={{ label: 'Primary', href: '/a' }}
      />,
    );

    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('renders the secondary action as a link when provided', () => {
    renderWithIntl(
      <BookingOutcomeLayout
        booking={makeBooking()}
        bannerTitle="title"
        bannerBody="body"
        asideBody="aside"
        primaryAction={{ label: 'Primary', href: '/a' }}
        secondaryAction={{ label: 'Secondary', href: '/b' }}
      />,
    );

    const links = screen.getAllByRole('link', { name: 'Secondary' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', '/b');
    }
  });

  it('renders children below the banner card', () => {
    renderWithIntl(
      <BookingOutcomeLayout
        booking={makeBooking()}
        bannerTitle="title"
        bannerBody="body"
        asideBody="aside"
        primaryAction={{ label: 'Primary', href: '/a' }}
      >
        <div data-testid="outcome-extra">Extra content</div>
      </BookingOutcomeLayout>,
    );

    expect(screen.getByTestId('outcome-extra')).toHaveTextContent('Extra content');
  });

  it.each([
    ['success', 'text-green-700'],
    ['danger', 'text-red-700'],
    ['info', 'text-blue-700'],
  ] as const)('applies the %s tone class to the banner title', (tone, expectedClass) => {
    renderWithIntl(
      <BookingOutcomeLayout
        booking={makeBooking()}
        bannerTitle="title"
        bannerBody="body"
        asideBody="aside"
        primaryAction={{ label: 'Primary', href: '/a' }}
        tone={tone}
      />,
    );

    expect(screen.getByTestId('outcome-banner-title').className).toContain(expectedClass);
  });
});
