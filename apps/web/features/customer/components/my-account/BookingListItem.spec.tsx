// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomerBookingListItem as CustomerBookingListItemDto } from '@ikaro/types';
import { BookingListItem } from './BookingListItem';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      'customer.bookingItem': {
        statusPending: 'Aguardando',
        statusInfoRequested: 'Info pedida',
        statusApproved: 'Aprovado',
        statusRejected: 'Rejeitado',
        statusCancelled: 'Cancelado',
        statusCompleted: 'Concluído',
        infoNeeded: 'Admin precisa de informações',
        cancel: 'Cancelar',
        cancelRequest: 'Cancelar solicitação',
        respond: 'Responder',
        windowClosed: 'Prazo encerrado',
      },
    };
    return (key: string, params?: Record<string, unknown>) => {
      let value = translations[namespace]?.[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(`{${k}}`, String(v));
        }
      }
      return value;
    };
  },
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatMoney: (amount: number) => `R$ ${amount.toFixed(2)}`,
    formatTime: (date: Date) => date.toISOString().slice(11, 16),
    formatDateLong: () => 'Sábado, 20 de junho',
    formatDate: (date: Date) => date.toISOString().slice(0, 10),
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: React.PropsWithChildren<{ href: string } & Record<string, unknown>>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const FUTURE = '2999-01-01T00:00:00.000Z';

function makeItem(overrides: Partial<CustomerBookingListItemDto> = {}): CustomerBookingListItemDto {
  return {
    bookingId: 'b1',
    status: 'PENDING',
    scheduledAt: '2026-06-20T10:00:00.000Z',
    lines: [
      {
        lineId: 'l1',
        serviceName: 'Lavagem Completa',
        durationMinsAtBooking: 60,
        priceAtBooking: { amount: 180, currency: 'BRL' },
        actualPriceCharged: null,
      },
      {
        lineId: 'l2',
        serviceName: 'Cera',
        durationMinsAtBooking: 15,
        priceAtBooking: { amount: 50, currency: 'BRL' },
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 230, currency: 'BRL' },
    cancellableUntil: null,
    ...overrides,
  };
}

function renderItem(item: CustomerBookingListItemDto) {
  return render(
    <ul>
      <BookingListItem item={item} tenantSlug="lavacar-bh" />
    </ul>,
  );
}

describe('BookingListItem', () => {
  it('renders service names joined, date, time and total price', () => {
    renderItem(makeItem());

    expect(screen.getByText('Lavagem Completa, Cera')).toBeInTheDocument();
    expect(screen.getByText(/Sábado, 20 de junho · 10:00 · R\$ 230\.00/)).toBeInTheDocument();
  });

  it('links the service names to the booking detail page', () => {
    renderItem(makeItem());

    expect(screen.getByRole('link', { name: 'Lavagem Completa, Cera' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1',
    );
  });

  it('APPROVED within the window: shows "Cancelar" linking to the cancel page', () => {
    renderItem(makeItem({ status: 'APPROVED', cancellableUntil: FUTURE }));

    expect(screen.getByRole('link', { name: 'Cancelar' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1/cancel',
    );
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
  });

  it('APPROVED outside the window: hides "Cancelar" and shows the closed-window note', () => {
    renderItem(makeItem({ status: 'APPROVED', cancellableUntil: '2000-01-01T00:00:00.000Z' }));

    expect(screen.queryByRole('link', { name: 'Cancelar' })).not.toBeInTheDocument();
    expect(screen.getByText('Prazo encerrado')).toBeInTheDocument();
  });

  it('PENDING: shows "Cancelar solicitação" and the waiting badge', () => {
    renderItem(makeItem({ status: 'PENDING' }));

    expect(screen.getByRole('link', { name: 'Cancelar solicitação' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1/cancel',
    );
    expect(screen.getByText('Aguardando')).toBeInTheDocument();
  });

  it('INFO_REQUESTED: shows "Responder" (not "Cancelar") and the info note', () => {
    renderItem(makeItem({ status: 'INFO_REQUESTED' }));

    expect(screen.getByRole('link', { name: 'Responder' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1',
    );
    expect(screen.queryByText('Cancelar')).not.toBeInTheDocument();
    expect(screen.getByText('Admin precisa de informações')).toBeInTheDocument();
    expect(screen.getByText('Info pedida')).toBeInTheDocument();
  });

  it.each(['COMPLETED', 'CANCELLED', 'REJECTED'] as const)(
    '%s: renders badge only, with no action links',
    (status) => {
      renderItem(makeItem({ status }));

      expect(screen.queryByText('Cancelar')).not.toBeInTheDocument();
      expect(screen.queryByText('Cancelar solicitação')).not.toBeInTheDocument();
      expect(screen.queryByText('Responder')).not.toBeInTheDocument();
      // The detail link on the service name remains — it is navigation, not an action.
      expect(screen.getAllByRole('link')).toHaveLength(1);
    },
  );
});
