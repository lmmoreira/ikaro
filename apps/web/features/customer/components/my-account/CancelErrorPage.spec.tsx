// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import {
  CustomerTopbarStatusProvider,
  useCustomerTopbarStatus,
} from '../customer-topbar-status-context';
import { CancelErrorPage } from './CancelErrorPage';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      title: 'Cancelamento fora do prazo',
      body: 'Agendamentos aprovados só podem ser cancelados com antecedência mínima.',
      deadlineNote: 'O prazo de cancelamento encerrou em {date} às {time}.',
      contactNote: 'Precisa cancelar mesmo assim? Entre em contato.',
      whatsappCta: 'Contato via WhatsApp',
      backButton: 'Voltar ao agendamento',
      backToBooking: 'Agendamento',
    };
    let value = translations[key] ?? key;
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
    formatDateLong: () => '18 de junho',
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

function makeBooking(): CustomerBookingDetailResponse {
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
    cancellableUntil: '2026-06-18T10:00:00.000Z',
    infoRequestMessage: null,
    infoResponseMessage: null,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    completedAt: null,
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    pointsEarned: null,
  };
}

describe('CancelErrorPage', () => {
  it('shows the deadline note and booking summary', () => {
    render(
      <CancelErrorPage booking={makeBooking()} tenantSlug="lavacar-bh" whatsapp="+5531999999999" />,
    );

    expect(screen.getByText('Cancelamento fora do prazo')).toBeInTheDocument();
    expect(
      screen.getByText('O prazo de cancelamento encerrou em 18 de junho às 10:00.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
  });

  it('renders a working wa.me link built from the tenant WhatsApp number', () => {
    render(
      <CancelErrorPage
        booking={makeBooking()}
        tenantSlug="lavacar-bh"
        whatsapp="+55 31 99999-9999"
      />,
    );

    const link = screen.getByRole('link', { name: 'Contato via WhatsApp' });
    expect(link).toHaveAttribute('href', 'https://wa.me/5531999999999');
  });

  it('hides the WhatsApp CTA when the tenant has no number configured', () => {
    render(<CancelErrorPage booking={makeBooking()} tenantSlug="lavacar-bh" whatsapp={null} />);

    expect(screen.queryByRole('link', { name: 'Contato via WhatsApp' })).not.toBeInTheDocument();
  });

  it('links back to the booking detail page', () => {
    render(<CancelErrorPage booking={makeBooking()} tenantSlug="lavacar-bh" whatsapp={null} />);

    expect(screen.getByRole('link', { name: 'Voltar ao agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1',
    );
  });

  it('syncs the booking status and back link to the shared topbar context', () => {
    function TopbarStatusProbe(): React.JSX.Element {
      const status = useCustomerTopbarStatus();
      return (
        <div>
          <p data-testid="probe-booking-status">{status?.bookingStatus ?? 'none'}</p>
          <p data-testid="probe-back-href">{status?.backHrefOverride ?? 'none'}</p>
          <p data-testid="probe-back-label">{status?.backLabelOverride ?? 'none'}</p>
        </div>
      );
    }

    render(
      <CustomerTopbarStatusProvider>
        <TopbarStatusProbe />
        <CancelErrorPage booking={makeBooking()} tenantSlug="lavacar-bh" whatsapp={null} />
      </CustomerTopbarStatusProvider>,
    );

    expect(screen.getByTestId('probe-booking-status')).toHaveTextContent('APPROVED');
    expect(screen.getByTestId('probe-back-href')).toHaveTextContent(
      '/lavacar-bh/my-account/bookings/b1',
    );
    expect(screen.getByTestId('probe-back-label')).toHaveTextContent('Agendamento');
  });
});
