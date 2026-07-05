// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomerBookingListItem, CustomerLoyaltyBalanceResponse } from '@ikaro/types';
import { HomeDashboard } from './HomeDashboard';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      'customer.home': {
        greeting: 'Olá, {name}',
        points: 'Pontos',
        pointsValue: '{points} pts',
        bookings: 'Agendamentos',
        bookingsTotal: '{count} total',
        expiryStrip: '{points} pts expiram em {date}',
        upcomingTitle: 'Próximos agendamentos',
        viewAll: 'Ver todos os agendamentos →',
        newBooking: '+ Novo agendamento',
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

function renderHome(bookings: CustomerBookingListItem[], userName: string | null = 'João Silva') {
  return render(
    <HomeDashboard
      bookings={bookings}
      loyaltyBalance={balance}
      userName={userName}
      tenantSlug="lavacar-bh"
    />,
  );
}

describe('HomeDashboard', () => {
  it('greets the customer by name', () => {
    renderHome([]);
    expect(screen.getByText('Olá, João Silva')).toBeInTheDocument();
  });

  it('omits the greeting when userName is null', () => {
    renderHome([], null);
    expect(screen.queryByText(/Olá/)).not.toBeInTheDocument();
  });

  it('shows the points stat card from currentPoints', () => {
    renderHome([]);
    expect(screen.getByText('Pontos')).toBeInTheDocument();
    expect(screen.getByText('120 pts')).toBeInTheDocument();
  });

  it('counts only APPROVED and COMPLETED bookings in the bookings stat card', () => {
    renderHome([
      makeItem({ status: 'APPROVED' }),
      makeItem({ status: 'COMPLETED', scheduledAt: '2026-06-05T09:00:00.000Z' }),
      makeItem({ status: 'PENDING' }),
      makeItem({ status: 'CANCELLED', scheduledAt: '2026-05-15T11:00:00.000Z' }),
    ]);
    expect(screen.getByText('2 total')).toBeInTheDocument();
  });

  it('shows the expiry strip linking to the loyalty page when nextExpiryDate is set', () => {
    renderHome([]);
    const strip = screen.getByRole('link', { name: '12 pts expiram em 2026-08-15' });
    expect(strip).toHaveAttribute('href', '/lavacar-bh/my-account/loyalty');
  });

  it('previews at most three upcoming/pending bookings with a view-all link', () => {
    renderHome([
      makeItem({ status: 'APPROVED' }),
      makeItem({ status: 'PENDING' }),
      makeItem({ status: 'INFO_REQUESTED' }),
      makeItem({ status: 'APPROVED' }),
    ]);

    expect(screen.getAllByText('Lavagem Completa')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Ver todos os agendamentos →' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings',
    );
  });

  it('shows the empty state when there is nothing to preview', () => {
    renderHome([makeItem({ status: 'CANCELLED', scheduledAt: '2026-05-15T11:00:00.000Z' })]);
    expect(screen.getByText('Nenhum agendamento ainda')).toBeInTheDocument();
  });

  it('renders the mobile new-booking CTA linking to the booking flow', () => {
    renderHome([]);
    expect(screen.getByRole('link', { name: '+ Novo agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/booking',
    );
  });
});
