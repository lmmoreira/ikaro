// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CustomerTopbarStatusProvider,
  useCustomerTopbarStatus,
} from '../customer-topbar-status-context';
import { AvailabilityAlertDetail } from './AvailabilityAlertDetail';
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

function BackLinkProbe(): React.JSX.Element {
  const status = useCustomerTopbarStatus();
  return (
    <p data-testid="back-probe">
      {status?.backHrefOverride}|{status?.backLabelOverride}
    </p>
  );
}

describe('AvailabilityAlertDetail', () => {
  it('shows the cancel action of an active alert, in both action panes', () => {
    render(<AvailabilityAlertDetail alert={makeAlert({ id: 'abc' })} tenantSlug="vitta" />);

    const mobile = screen.getByTestId('action-pane-mobile');
    const desktop = screen.getByTestId('action-pane-desktop');

    for (const pane of [mobile, desktop]) {
      expect(within(pane).getByTestId('cancel-alert-link')).toHaveAttribute(
        'href',
        '/vitta/my-account/alerts/abc/cancel',
      );
    }
    expect(screen.getAllByTestId('alert-status-badge')[0]).toHaveTextContent('statusActive');
  });

  // Negative guarantee (M23-S43): a finished alert is read-only history.
  it.each([
    ['NOTIFIED', 'statusNotified'],
    ['EXPIRED', 'statusExpired'],
  ] as const)('renders no cancel action for a %s alert', (status, badge) => {
    render(
      <AvailabilityAlertDetail
        alert={makeAlert({ status, notifiedAt: '2026-09-14T13:12:00.000Z' })}
        tenantSlug="vitta"
      />,
    );

    expect(screen.queryByTestId('cancel-alert-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('alert-status-badge')).toHaveTextContent(badge);
    expect(screen.getAllByTestId('alert-new-booking')[0]).toHaveAttribute('href', '/vitta/booking');
  });

  it('shows when a notified alert was emailed, and when an expired one lapsed', () => {
    const { rerender } = render(
      <AvailabilityAlertDetail
        alert={makeAlert({ status: 'NOTIFIED', notifiedAt: '2026-09-14T13:12:00.000Z' })}
        tenantSlug="vitta"
      />,
    );

    expect(screen.getByText(/notifiedAtValue.*2026-09-14.*13:12/)).toBeInTheDocument();
    expect(screen.getByText('notifiedViaEmail')).toBeInTheDocument();

    rerender(
      <AvailabilityAlertDetail alert={makeAlert({ status: 'EXPIRED' })} tenantSlug="vitta" />,
    );

    expect(screen.getByText('labelExpiredOn')).toBeInTheDocument();
  });

  it('lists the resource and the duration only when the alert has them', () => {
    const { rerender } = render(
      <AvailabilityAlertDetail
        alert={makeAlert({ preferredResourceName: 'Carla Menezes', durationMinutes: 90 })}
        tenantSlug="vitta"
      />,
    );

    expect(screen.getByText('Carla Menezes')).toBeInTheDocument();
    expect(screen.getByText('1h 30min')).toBeInTheDocument();

    rerender(
      <AvailabilityAlertDetail
        alert={makeAlert({ preferredResourceName: null, durationMinutes: null })}
        tenantSlug="vitta"
      />,
    );

    expect(screen.queryByText('labelResource')).not.toBeInTheDocument();
    expect(screen.queryByText('labelDuration')).not.toBeInTheDocument();
  });

  it('describes a weekly alert by its days and times', () => {
    render(
      <AvailabilityAlertDetail
        alert={makeAlert({
          criteriaType: 'WEEKLY_PREFERENCE',
          acceptableStartAt: null,
          acceptableEndAt: null,
          weekdays: ['friday'],
          localStartTime: '14:00',
          localEndTime: '18:00',
        })}
        tenantSlug="vitta"
      />,
    );

    expect(screen.getByText('criteriaWeekly')).toBeInTheDocument();
    expect(screen.getByText('labelDays')).toBeInTheDocument();
    expect(screen.getByText(/weeklyLine.*14:00.*18:00/)).toBeInTheDocument();
  });

  it('points the topbar back link at the list while it is mounted', () => {
    render(
      <CustomerTopbarStatusProvider>
        <BackLinkProbe />
        <AvailabilityAlertDetail alert={makeAlert()} tenantSlug="vitta" />
      </CustomerTopbarStatusProvider>,
    );

    expect(screen.getByTestId('back-probe')).toHaveTextContent(
      '/vitta/my-account/alerts|backToList',
    );
  });
});
