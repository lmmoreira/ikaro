// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import {
  CustomerTopbarStatusProvider,
  useCustomerTopbarStatus,
} from '../customer-topbar-status-context';
import { BookingDetailPage } from './BookingDetailPage';

function TopbarStatusProbe(): React.JSX.Element {
  const status = useCustomerTopbarStatus();
  return (
    <div data-testid="topbar-status-probe">
      <p data-testid="probe-booking-status">{status?.bookingStatus ?? 'none'}</p>
      <p data-testid="probe-back-href">{status?.backHrefOverride ?? 'none'}</p>
      <p data-testid="probe-back-label">{status?.backLabelOverride ?? 'none'}</p>
    </div>
  );
}

function renderWithTopbarStatus(ui: React.ReactElement): ReturnType<typeof render> {
  return render(
    <CustomerTopbarStatusProvider>
      <TopbarStatusProbe />
      {ui}
    </CustomerTopbarStatusProvider>,
  );
}

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, Record<string, string>> = {
      'customer.bookingDetail': {
        backToBookings: 'Agendamentos',
        backToLoyalty: 'Fidelidade',
        dateTimeTitle: 'Data e horário',
        dateLabel: 'Data',
        timeLabel: 'Horário',
        timeWithDuration: '{time} — duração estimada {minutes} min',
        servicesTitle: 'Serviços',
        total: 'Total',
        cancelWindowNote: 'Cancelamento gratuito até {date} às {time}',
        cancelButton: 'Cancelar agendamento',
        cancelRequestButton: 'Cancelar solicitação',
        responseSentConfirmation: 'Resposta enviada! Nossa equipe vai analisar em breve.',
        completedNote: 'Serviço concluído. Pontos já adicionados.',
        newBookingCta: 'Fazer novo agendamento',
        viewPointsCta: 'Ver meus pontos →',
      },
      'customer.bookingItem': {
        statusPending: 'Aguardando',
        statusInfoRequested: 'Info pedida',
        statusApproved: 'Aprovado',
        statusRejected: 'Rejeitado',
        statusCancelled: 'Cancelado',
        statusCompleted: 'Concluído',
      },
      'customer.infoSubmit': {
        label: 'Mensagem',
        submit: 'Enviar resposta',
        submitting: 'Enviando...',
        retry: 'Tentar novamente',
        validationError: 'Informe sua resposta antes de enviar.',
        submitError: 'Falha ao enviar.',
      },
    };
    let value = translations[namespace]?.[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  },
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatMoney: (amount: number) => `R$ ${amount.toFixed(2)}`,
    formatTime: () => '10:00',
    formatDateLong: () => 'Sábado, 20 de junho',
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

const submitInfoMock = vi.fn();
vi.mock('../../api', () => ({
  submitInfo: (...args: unknown[]) => submitInfoMock(...args),
}));

function makeBooking(
  overrides: Partial<CustomerBookingDetailResponse> = {},
): CustomerBookingDetailResponse {
  return {
    bookingId: 'b1',
    status: 'APPROVED',
    scheduledAt: '2026-06-20T10:00:00.000Z',
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
    notes: null,
    cancellableUntil: null,
    infoRequestMessage: null,
    infoResponseMessage: null,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    completedAt: null,
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    pointsEarned: null,
    ...overrides,
  };
}

describe('BookingDetailPage', () => {
  beforeEach(() => {
    submitInfoMock.mockReset();
  });

  it('syncs the back link and booking status to the shared topbar context', () => {
    renderWithTopbarStatus(<BookingDetailPage booking={makeBooking()} tenantSlug="lavacar-bh" />);

    expect(screen.getByTestId('probe-back-href')).toHaveTextContent(
      '/lavacar-bh/my-account/bookings',
    );
    expect(screen.getByTestId('probe-back-label')).toHaveTextContent('Agendamentos');
    expect(screen.getByTestId('probe-booking-status')).toHaveTextContent('APPROVED');
  });

  it('uses returnTo for the back link when reached from the loyalty page', () => {
    renderWithTopbarStatus(
      <BookingDetailPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        returnTo="/lavacar-bh/my-account/loyalty"
      />,
    );

    expect(screen.getByTestId('probe-back-href')).toHaveTextContent(
      '/lavacar-bh/my-account/loyalty',
    );
    expect(screen.getByTestId('probe-back-label')).toHaveTextContent('Fidelidade');
  });

  it('APPROVED within window: shows the cancel action, no info form', () => {
    render(
      <BookingDetailPage
        booking={makeBooking({
          status: 'APPROVED',
          cancellableUntil: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        })}
        tenantSlug="lavacar-bh"
      />,
    );

    // Rendered twice: once inline for mobile, once in the sticky desktop sidebar.
    expect(screen.getAllByRole('link', { name: 'Cancelar agendamento' })).toHaveLength(2);
  });

  it('APPROVED outside window: hides the cancel action', () => {
    render(
      <BookingDetailPage
        booking={makeBooking({ status: 'APPROVED', cancellableUntil: null })}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByRole('link', { name: 'Cancelar agendamento' })).not.toBeInTheDocument();
  });

  it('APPROVED with a cancellableUntil already in the past: hides the cancel action', () => {
    render(
      <BookingDetailPage
        booking={makeBooking({
          status: 'APPROVED',
          cancellableUntil: new Date(Date.now() - 3_600_000).toISOString(),
        })}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByRole('link', { name: 'Cancelar agendamento' })).not.toBeInTheDocument();
  });

  it('INFO_REQUESTED with no prior response: shows the info-submit form', () => {
    render(
      <BookingDetailPage
        booking={makeBooking({
          status: 'INFO_REQUESTED',
          infoRequestMessage: 'Pode confirmar o polimento?',
          infoResponseMessage: null,
        })}
        tenantSlug="lavacar-bh"
      />,
    );

    // Rendered twice: once inline for mobile, once in the sticky desktop sidebar.
    expect(screen.getAllByText('Pode confirmar o polimento?')).toHaveLength(2);
    expect(screen.getAllByLabelText('Mensagem')).toHaveLength(2);
  });

  it('INFO_REQUESTED with a prior response: hides the form', () => {
    render(
      <BookingDetailPage
        booking={makeBooking({
          status: 'INFO_REQUESTED',
          infoRequestMessage: 'Pode confirmar o polimento?',
          infoResponseMessage: 'Sim, pode confirmar',
        })}
        tenantSlug="lavacar-bh"
      />,
    );

    expect(screen.queryByLabelText('Mensagem')).not.toBeInTheDocument();
  });

  it('submitting the info form flips the synced topbar status to PENDING and shows a confirmation', async () => {
    submitInfoMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithTopbarStatus(
      <BookingDetailPage
        booking={makeBooking({
          status: 'INFO_REQUESTED',
          infoRequestMessage: 'Pode confirmar o polimento?',
          infoResponseMessage: null,
        })}
        tenantSlug="lavacar-bh"
      />,
    );

    // Rendered twice (mobile + desktop sidebar) — act within the desktop pane only.
    const desktopPane = screen.getByTestId('action-pane-desktop');
    await user.type(within(desktopPane).getByLabelText('Mensagem'), 'Sim, pode');
    await user.click(within(desktopPane).getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() =>
      expect(screen.getByTestId('probe-booking-status')).toHaveTextContent('PENDING'),
    );
    expect(
      screen.getByText('Resposta enviada! Nossa equipe vai analisar em breve.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Mensagem')).not.toBeInTheDocument();
  });

  it('COMPLETED: no cancel action, shows the new-booking CTA', () => {
    render(
      <BookingDetailPage booking={makeBooking({ status: 'COMPLETED' })} tenantSlug="lavacar-bh" />,
    );

    expect(screen.queryByRole('link', { name: 'Cancelar agendamento' })).not.toBeInTheDocument();
    // Rendered twice: once inline for mobile, once in the sticky desktop sidebar.
    const ctas = screen.getAllByRole('link', { name: 'Fazer novo agendamento' });
    expect(ctas).toHaveLength(2);
    ctas.forEach((cta) => expect(cta).toHaveAttribute('href', '/lavacar-bh/booking'));
  });

  it('CANCELLED/REJECTED: no cancel action, no new-booking CTA', () => {
    render(
      <BookingDetailPage booking={makeBooking({ status: 'CANCELLED' })} tenantSlug="lavacar-bh" />,
    );

    expect(screen.queryByRole('link', { name: 'Cancelar agendamento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Fazer novo agendamento' })).not.toBeInTheDocument();
  });
});
