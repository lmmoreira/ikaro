// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomerBookingListItem, CustomerLoyaltyBalanceResponse } from '@ikaro/types';
import { BookingsList } from './BookingsList';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      'customer.bookings': {
        title: 'Meus Agendamentos',
        pointsActive: '{points} pts ativos',
        expiryStrip: '{points} pts expiram em {date}',
        sectionUpcoming: 'Próximos ({count})',
        sectionPending: 'Pendentes ({count})',
        sectionHistory: 'Histórico ({count})',
      },
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
      'customer.emptyState': {
        title: 'Nenhum agendamento ainda',
        body: 'Faça seu primeiro agendamento e acompanhe o histórico do seu carro aqui.',
        cta: 'Fazer agendamento',
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

const FUTURE = '2999-06-20T10:00:00.000Z';

const balance: CustomerLoyaltyBalanceResponse = {
  currentPoints: 120,
  nextExpiryDate: '2026-08-15T00:00:00.000Z',
  nextExpiryPoints: 12,
  conversionRate: 0,
};

function makeItem(overrides: Partial<CustomerBookingListItem> = {}): CustomerBookingListItem {
  return {
    bookingId: `b-${Math.random().toString(36).slice(2)}`,
    status: 'PENDING',
    scheduledAt: FUTURE,
    lines: [
      {
        lineId: 'l1',
        serviceName: 'Lavagem Completa',
        durationMinsAtBooking: 60,
        priceAtBooking: { amount: 180, currency: 'BRL' },
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 180, currency: 'BRL' },
    cancellableUntil: null,
    ...overrides,
  };
}

describe('BookingsList', () => {
  it('renders the three sections with count badges when all have items', () => {
    const bookings = [
      makeItem({ status: 'APPROVED' }),
      makeItem({ status: 'PENDING' }),
      makeItem({ status: 'INFO_REQUESTED' }),
      makeItem({ status: 'COMPLETED', scheduledAt: '2026-06-05T09:00:00.000Z' }),
    ];

    render(<BookingsList bookings={bookings} loyaltyBalance={balance} tenantSlug="lavacar-bh" />);

    expect(screen.getByText('Meus Agendamentos')).toBeInTheDocument();
    expect(screen.getByText('Próximos (1)')).toBeInTheDocument();
    expect(screen.getByText('Pendentes (2)')).toBeInTheDocument();
    expect(screen.getByText('Histórico (1)')).toBeInTheDocument();
  });

  it('hides a section entirely when it has no items', () => {
    render(
      <BookingsList
        bookings={[makeItem({ status: 'PENDING' })]}
        loyaltyBalance={balance}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByText(/Próximos/)).not.toBeInTheDocument();
    expect(screen.getByText('Pendentes (1)')).toBeInTheDocument();
    expect(screen.queryByText(/Histórico/)).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no bookings at all', () => {
    render(<BookingsList bookings={[]} loyaltyBalance={balance} tenantSlug="lavacar-bh" />);

    expect(screen.getByText('Nenhum agendamento ainda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fazer agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/booking',
    );
  });

  it('renders the loyalty strip with points and expiry, linking to the loyalty page', () => {
    render(<BookingsList bookings={[]} loyaltyBalance={balance} tenantSlug="lavacar-bh" />);

    const strip = screen.getByRole('link', { name: /120 pts ativos/ });
    expect(strip).toHaveAttribute('href', '/lavacar-bh/my-account/loyalty');
    expect(screen.getByText('12 pts expiram em 2026-08-15')).toBeInTheDocument();
  });

  it('hides the expiry note when nextExpiryDate is null', () => {
    render(
      <BookingsList
        bookings={[]}
        loyaltyBalance={{ ...balance, nextExpiryDate: null, nextExpiryPoints: null }}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByText(/expiram em/)).not.toBeInTheDocument();
  });
});
