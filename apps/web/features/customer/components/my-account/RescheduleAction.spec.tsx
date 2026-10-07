// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RescheduleAction } from './RescheduleAction';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      rescheduleWindowNote: 'Você pode reagendar até {date} às {time}',
      rescheduleButton: 'Reagendar',
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

describe('RescheduleAction', () => {
  it('links to the reschedule page and shows the deadline note', () => {
    render(
      <RescheduleAction
        tenantSlug="lavacar-bh"
        bookingId="b1"
        eligibleUntil="2026-06-18T10:00:00.000Z"
      />,
    );

    expect(screen.getByText('Você pode reagendar até 18 de junho às 10:00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reagendar' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1/reschedule',
    );
  });

  it('carries returnTo so the reschedule page can send the customer back where they came from', () => {
    render(
      <RescheduleAction
        tenantSlug="lavacar-bh"
        bookingId="b1"
        eligibleUntil="2026-06-18T10:00:00.000Z"
        returnTo="/lavacar-bh/my-account/loyalty"
      />,
    );

    expect(screen.getByRole('link', { name: 'Reagendar' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1/reschedule?returnTo=%2Flavacar-bh%2Fmy-account%2Floyalty',
    );
  });
});
