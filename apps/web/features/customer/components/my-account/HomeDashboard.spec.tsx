// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CustomerBookingListItem,
  CustomerLoyaltyBalanceResponse,
  RecurringBookingScheduleListItem,
} from '@ikaro/types';
import { HomeDashboard } from './HomeDashboard';

vi.mock('next-intl', () => ({
  useLocale: () => 'pt-BR',
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
        recurring: 'Recorrências',
        recurringValue: '{count} ativas',
        alerts: 'Avisos',
        alertsValue: '{count} ativos',
        renewTitle: '{service} termina em {days} dias',
        renewTitleMany: '{count} reservas terminando',
        renewMetaMany: 'A primeira termina em {days} dias',
        renewViewAll: 'Ver reservas',
      },
      'customer.recurringSchedules': {
        renewAction: 'Renovar',
      },
      'customer.newMenu': {
        label: 'Novo',
        booking: 'Agendamento',
        recurring: 'Reserva recorrente',
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
    timezone: 'America/Sao_Paulo',
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

function makeSchedule(
  overrides: Partial<RecurringBookingScheduleListItem> = {},
): RecurringBookingScheduleListItem {
  return {
    id: 'sched-1',
    customerId: 'c1',
    serviceId: 's1',
    serviceName: 'Sala Horizonte',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['friday'],
      startTime: '16:00',
      durationMinutes: 120,
    },
    startsOn: '2026-06-01',
    endsOn: '2026-08-29',
    status: 'ACTIVE',
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    approvalHoldExpiresAt: null,
    renewable: false,
    ...overrides,
  };
}

interface RenderOptions {
  readonly userName?: string | null;
  readonly recurringSchedules?: readonly RecurringBookingScheduleListItem[] | null;
  readonly activeAlertCount?: number | null;
}

function renderHome(
  bookings: CustomerBookingListItem[],
  { userName = 'João Silva', recurringSchedules = [], activeAlertCount = 0 }: RenderOptions = {},
) {
  return render(
    <HomeDashboard
      bookings={bookings}
      loyaltyBalance={balance}
      userName={userName}
      tenantSlug="lavacar-bh"
      recurringSchedules={recurringSchedules}
      activeAlertCount={activeAlertCount}
    />,
  );
}

describe('HomeDashboard', () => {
  it('greets the customer by name', () => {
    renderHome([]);
    expect(screen.getByText('Olá, João Silva')).toBeInTheDocument();
  });

  it('omits the greeting when userName is null', () => {
    renderHome([], { userName: null });
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

  it('renders the mobile "+ Novo" menu, hidden from lg up, with both destinations', () => {
    renderHome([]);

    expect(screen.getByTestId('mobile-new-menu').className).toContain('lg:hidden');
    fireEvent.click(screen.getByTestId('new-menu-trigger'));
    expect(screen.getByTestId('new-menu-booking')).toHaveAttribute('href', '/lavacar-bh/booking');
    expect(screen.getByTestId('new-menu-recurring')).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/recurring-schedules/new',
    );
  });
});

describe('HomeDashboard — the tiles', () => {
  it('links Pontos to the loyalty page and Agendamentos to the bookings list', () => {
    renderHome([]);

    expect(screen.getByTestId('home-points-value').closest('a')).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/loyalty',
    );
    expect(screen.getByTestId('home-bookings-value').closest('a')).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings',
    );
  });

  it('shows neither extra tile nor the card for a customer with no schedules and no alerts (negative guarantee)', () => {
    renderHome([]);

    expect(screen.queryByText('Recorrências')).not.toBeInTheDocument();
    expect(screen.queryByText('Avisos')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-recurring-value')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-alerts-value')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-renewal-card')).not.toBeInTheDocument();
    // Pontos, Agendamentos and the booking preview are all still there.
    expect(screen.getByTestId('home-points-value')).toBeInTheDocument();
    expect(screen.getByTestId('home-bookings-value')).toBeInTheDocument();
    expect(screen.getByText('Nenhum agendamento ainda')).toBeInTheDocument();
  });

  it('shows the Recorrências tile with the active count, linking to the recurring list', () => {
    renderHome([], { recurringSchedules: [makeSchedule({ id: 'a' }), makeSchedule({ id: 'b' })] });

    expect(screen.getByTestId('home-recurring-value')).toHaveTextContent('2 ativas');
    expect(screen.getByTestId('home-recurring-value').closest('a')).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/recurring-schedules',
    );
  });

  it('shows the Avisos tile with the active count, linking to the alerts list', () => {
    renderHome([], { activeAlertCount: 3 });

    expect(screen.getByTestId('home-alerts-value')).toHaveTextContent('3 ativos');
    expect(screen.getByTestId('home-alerts-value').closest('a')).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/alerts',
    );
  });

  it('hides only the tile of a failed read — the other tile and the page still render', () => {
    renderHome([], { recurringSchedules: null, activeAlertCount: 2 });

    expect(screen.queryByTestId('home-recurring-value')).not.toBeInTheDocument();
    expect(screen.queryByTestId('home-renewal-card')).not.toBeInTheDocument();
    expect(screen.getByTestId('home-alerts-value')).toBeInTheDocument();

    renderHome([], { recurringSchedules: [makeSchedule()], activeAlertCount: null });

    expect(screen.getAllByTestId('home-recurring-value')).toHaveLength(1);
    expect(screen.getAllByTestId('home-alerts-value')).toHaveLength(1);
    expect(screen.getAllByTestId('home-points-value')).toHaveLength(2);
  });
});

describe('HomeDashboard — the "Renovar" card', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 2026-08-22 12:00 in São Paulo.
    vi.setSystemTime(new Date('2026-08-22T15:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows no card while no running schedule is flagged renewable', () => {
    renderHome([], { recurringSchedules: [makeSchedule({ renewable: false })] });

    expect(screen.getByTestId('home-recurring-value')).toBeInTheDocument();
    expect(screen.queryByTestId('home-renewal-card')).not.toBeInTheDocument();
  });

  it('shows the card for the renewable schedule, with the days left in the tenant timezone', () => {
    renderHome([], { recurringSchedules: [makeSchedule({ id: 'sched-7', renewable: true })] });

    expect(screen.getByTestId('home-renewal-title')).toHaveTextContent(
      'Sala Horizonte termina em 7 dias',
    );
    expect(screen.getByTestId('home-renewal-action')).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/recurring-schedules/new?renewFrom=sched-7',
    );
  });

  it('says how many are ending, and links to the list, when several are renewable', () => {
    renderHome([], {
      recurringSchedules: [
        makeSchedule({ id: 'a', renewable: true, endsOn: '2026-08-25' }),
        makeSchedule({ id: 'b', renewable: true, endsOn: '2026-08-29' }),
      ],
    });

    expect(screen.getByTestId('home-renewal-title')).toHaveTextContent('2 reservas terminando');
    expect(screen.getByTestId('home-renewal-action')).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/recurring-schedules',
    );
  });

  it('sits after the loyalty expiry strip and before the upcoming bookings', () => {
    renderHome([], { recurringSchedules: [makeSchedule({ renewable: true })] });

    const strip = screen.getByRole('link', { name: '12 pts expiram em 2026-08-15' });
    const card = screen.getByTestId('home-renewal-card');
    const upcoming = screen.getByText('Próximos agendamentos');
    expect(strip.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(upcoming) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
