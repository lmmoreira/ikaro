// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomerBookingListItem } from '@ikaro/types';
import { BookingsList } from './BookingsList';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      'customer.bookings': {
        title: 'Meus Agendamentos',
        recurringEntryTitle: 'Reservas recorrentes',
        recurringEntryActive: '{count} ativas',
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
        body: 'Faça seu primeiro agendamento e acompanhe seu histórico aqui.',
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

describe('BookingsList mobile "+ Novo" menu', () => {
  it.each([
    ['with bookings', [makeItem({ status: 'APPROVED' })]],
    ['with no bookings', []],
  ])('is in the page header, hidden from lg up, %s', (_label, bookings) => {
    render(<BookingsList bookings={bookings} recurringSummary={null} tenantSlug="lavacar-bh" />);

    expect(screen.getByTestId('mobile-new-menu').className).toContain('lg:hidden');
    fireEvent.click(screen.getByTestId('new-menu-trigger'));
    expect(screen.getByTestId('new-menu-booking')).toHaveAttribute('href', '/lavacar-bh/booking');
    expect(screen.getByTestId('new-menu-recurring')).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/recurring-schedules/new',
    );
  });
});

describe('BookingsList', () => {
  it('renders the three sections with count badges when all have items', () => {
    const bookings = [
      makeItem({ status: 'APPROVED' }),
      makeItem({ status: 'PENDING' }),
      makeItem({ status: 'INFO_REQUESTED' }),
      makeItem({ status: 'COMPLETED', scheduledAt: '2026-06-05T09:00:00.000Z' }),
    ];

    render(<BookingsList bookings={bookings} recurringSummary={null} tenantSlug="lavacar-bh" />);

    expect(screen.getByText('Meus Agendamentos')).toBeInTheDocument();
    expect(screen.getByText('Próximos (1)')).toBeInTheDocument();
    expect(screen.getByText('Pendentes (2)')).toBeInTheDocument();
    expect(screen.getByText('Histórico (1)')).toBeInTheDocument();
  });

  it('hides a section entirely when it has no items', () => {
    render(
      <BookingsList
        bookings={[makeItem({ status: 'PENDING' })]}
        recurringSummary={null}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByText(/Próximos/)).not.toBeInTheDocument();
    expect(screen.getByText('Pendentes (1)')).toBeInTheDocument();
    expect(screen.queryByText(/Histórico/)).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no bookings at all', () => {
    render(<BookingsList bookings={[]} recurringSummary={null} tenantSlug="lavacar-bh" />);

    expect(screen.getByText('Nenhum agendamento ainda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fazer agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/booking',
    );
  });

  it('no longer renders a points strip (points live on Início and Fidelidade)', () => {
    render(<BookingsList bookings={[]} recurringSummary={null} tenantSlug="lavacar-bh" />);

    expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
    expect(screen.queryByText(/pontos ativos/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /fidelidade/i })).not.toBeInTheDocument();
    expect(document.querySelector('a[href$="/my-account/loyalty"]')).toBeNull();
  });

  it('shows the recurring entry row with the active count when the customer has any schedule', () => {
    render(
      <BookingsList
        bookings={[]}
        recurringSummary={{ hasAny: true, activeCount: 2 }}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByTestId('recurring-entry-row')).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/recurring-schedules',
    );
    expect(screen.getByTestId('recurring-entry-count')).toHaveTextContent('2 ativas');
  });

  it('still shows the entry row when every schedule has ended (count 0)', () => {
    render(
      <BookingsList
        bookings={[]}
        recurringSummary={{ hasAny: true, activeCount: 0 }}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.getByTestId('recurring-entry-count')).toHaveTextContent('0 ativas');
  });

  it('hides the entry row when the customer has no schedule', () => {
    render(
      <BookingsList
        bookings={[]}
        recurringSummary={{ hasAny: false, activeCount: 0 }}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByTestId('recurring-entry-row')).not.toBeInTheDocument();
  });

  it('hides the entry row and still renders the tab when the summary is unavailable', () => {
    render(
      <BookingsList
        bookings={[makeItem({ status: 'PENDING' })]}
        recurringSummary={null}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByTestId('recurring-entry-row')).not.toBeInTheDocument();
    expect(screen.getByText('Pendentes (1)')).toBeInTheDocument();
  });
});
