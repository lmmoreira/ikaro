// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CancelAction } from './CancelAction';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      cancelWindowNote: 'Cancelamento gratuito até {date} às {time}',
      cancelButton: 'Cancelar agendamento',
      cancelRequestButton: 'Cancelar solicitação',
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
    formatDateLong: () => '18 de junho',
    formatTime: () => '10:00',
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

describe('CancelAction', () => {
  it('APPROVED: shows "Cancelar agendamento" and the window note, linking to the cancel page', () => {
    render(
      <CancelAction
        tenantSlug="lavacar-bh"
        bookingId="b1"
        status="APPROVED"
        cancellableUntil="2026-06-18T10:00:00.000Z"
      />,
    );

    expect(screen.getByText('Cancelamento gratuito até 18 de junho às 10:00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancelar agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1/cancel',
    );
  });

  it('PENDING: shows "Cancelar solicitação" with no window note', () => {
    render(
      <CancelAction
        tenantSlug="lavacar-bh"
        bookingId="b1"
        status="PENDING"
        cancellableUntil={null}
      />,
    );

    expect(screen.getByRole('link', { name: 'Cancelar solicitação' })).toBeInTheDocument();
    expect(screen.queryByText(/Cancelamento gratuito/)).not.toBeInTheDocument();
  });

  it('INFO_REQUESTED: shows "Cancelar solicitação"', () => {
    render(
      <CancelAction
        tenantSlug="lavacar-bh"
        bookingId="b1"
        status="INFO_REQUESTED"
        cancellableUntil={null}
      />,
    );

    expect(screen.getByRole('link', { name: 'Cancelar solicitação' })).toBeInTheDocument();
  });
});
