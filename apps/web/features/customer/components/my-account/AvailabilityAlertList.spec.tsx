// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AvailabilityAlertList } from './AvailabilityAlertList';
import { makeAlert } from './availability-alert.fixture';

vi.mock('next-intl', () => ({
  useLocale: () => 'pt-BR',
  useTranslations: () => (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatDate: (date: Date) => date.toISOString().slice(0, 10),
    formatTime: (date: Date) => date.toISOString().slice(11, 16),
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

describe('AvailabilityAlertList', () => {
  it('puts active alerts first and the finished ones under the history, each with its badge', () => {
    render(
      <AvailabilityAlertList
        tenantSlug="vitta"
        alerts={[
          makeAlert({ id: 'a', status: 'ACTIVE' }),
          makeAlert({ id: 'n', status: 'NOTIFIED', notifiedAt: '2026-09-14T13:12:00.000Z' }),
          makeAlert({ id: 'x', status: 'EXPIRED' }),
        ]}
      />,
    );

    const active = screen.getByTestId('section-active');
    const history = screen.getByTestId('section-history');

    expect(within(active).getByTestId('alert-status-badge')).toHaveTextContent('statusActive');
    expect(
      within(history)
        .getAllByTestId('alert-status-badge')
        .map((badge) => badge.textContent),
    ).toEqual(['statusNotified', 'statusExpired']);
  });

  it('offers "Cancelar aviso" on an active row only, and never on a history row', () => {
    render(
      <AvailabilityAlertList
        tenantSlug="vitta"
        alerts={[
          makeAlert({ id: 'a', status: 'ACTIVE' }),
          makeAlert({ id: 'n', status: 'NOTIFIED' }),
          makeAlert({ id: 'x', status: 'EXPIRED' }),
        ]}
      />,
    );

    const cancelLinks = screen.getAllByTestId('cancel-alert-action');

    expect(cancelLinks).toHaveLength(1);
    expect(cancelLinks[0]).toHaveAttribute('href', '/vitta/my-account/alerts/a/cancel');
    expect(
      within(screen.getByTestId('section-history')).queryByTestId('cancel-alert-action'),
    ).not.toBeInTheDocument();
  });

  it('titles a row with the service and its resource, and links the title to the detail page', () => {
    render(
      <AvailabilityAlertList
        tenantSlug="vitta"
        alerts={[makeAlert({ id: 'abc', preferredResourceName: 'Carla Menezes' })]}
      />,
    );

    expect(
      screen.getByRole('link', { name: 'Massagem relaxante · Carla Menezes' }),
    ).toHaveAttribute('href', '/vitta/my-account/alerts/abc');
  });

  it('describes the criteria, the duration and what happened to each alert', () => {
    render(
      <AvailabilityAlertList
        tenantSlug="vitta"
        alerts={[
          makeAlert({
            id: 'w',
            criteriaType: 'WEEKLY_PREFERENCE',
            acceptableStartAt: null,
            acceptableEndAt: null,
            weekdays: ['thursday', 'tuesday'],
            localStartTime: '09:00',
            localEndTime: '12:00',
            durationMinutes: 45,
          }),
          makeAlert({ id: 'n', status: 'NOTIFIED', notifiedAt: '2026-09-14T13:12:00.000Z' }),
          makeAlert({ id: 'x', status: 'EXPIRED' }),
        ]}
      />,
    );

    expect(screen.getByText(/weeklyLine.*09:00.*12:00.* · 45 min/)).toBeInTheDocument();
    expect(screen.getByText(/activeUntil.*2026-11-05/)).toBeInTheDocument();
    expect(screen.getByText(/notifiedOn.*2026-09-14/)).toBeInTheDocument();
    expect(screen.getByText(/expiredOn.*2026-11-05/)).toBeInTheDocument();
  });

  it('says only "notified" when the send time is unknown', () => {
    render(
      <AvailabilityAlertList
        tenantSlug="vitta"
        alerts={[makeAlert({ status: 'NOTIFIED', notifiedAt: null })]}
      />,
    );

    expect(screen.getByText('notified')).toBeInTheDocument();
  });

  it('hides a cancelled alert — it no longer exists for the customer', () => {
    render(
      <AvailabilityAlertList
        tenantSlug="vitta"
        alerts={[makeAlert({ id: 'a' }), makeAlert({ id: 'c', status: 'CANCELLED' })]}
      />,
    );

    expect(screen.getAllByTestId('alert-row')).toHaveLength(1);
  });

  it('shows the empty state with a way to book when there is nothing to list', () => {
    render(<AvailabilityAlertList tenantSlug="vitta" alerts={[]} />);

    expect(screen.getByTestId('alerts-empty')).toBeInTheDocument();
    expect(screen.getByTestId('alerts-empty-cta')).toHaveAttribute('href', '/vitta/booking');
  });

  it('shows the empty state when the only alert was cancelled', () => {
    render(
      <AvailabilityAlertList tenantSlug="vitta" alerts={[makeAlert({ status: 'CANCELLED' })]} />,
    );

    expect(screen.getByTestId('alerts-empty')).toBeInTheDocument();
  });

  // Negative guarantee (M23-S43): an alert is created from the booking flow, never from here.
  it('has no create control and no edit control', () => {
    render(<AvailabilityAlertList tenantSlug="vitta" alerts={[makeAlert()]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs.every((href) => !/\/new|availability-alert|\/edit/.test(href ?? ''))).toBe(true);
  });
});
