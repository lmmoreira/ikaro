// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { DashboardTopbarStatusProvider, useDashboardTopbarStatus } from './topbar-status-context';

function Probe(): React.JSX.Element {
  const status = useDashboardTopbarStatus();

  return (
    <div>
      <p>{status?.bookingStatus ?? 'none'}</p>
      <p>{status?.serviceStatus ?? 'none'}</p>
      <button type="button" onClick={() => status?.setBookingStatus('APPROVED')}>
        booking
      </button>
      <button type="button" onClick={() => status?.setServiceStatus('ACTIVE')}>
        service
      </button>
    </div>
  );
}

describe('DashboardTopbarStatusProvider', () => {
  it('exposes the initial booking status to consumers', () => {
    render(
      <DashboardTopbarStatusProvider initialBookingStatus="INFO_REQUESTED">
        <Probe />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByText('INFO_REQUESTED')).toBeInTheDocument();
  });

  it('exposes the initial service status to consumers', () => {
    render(
      <DashboardTopbarStatusProvider initialServiceStatus="INACTIVE">
        <Probe />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByText('INACTIVE')).toBeInTheDocument();
  });

  it('lets consumers update the booking status', async () => {
    render(
      <DashboardTopbarStatusProvider initialBookingStatus="PENDING">
        <Probe />
      </DashboardTopbarStatusProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'booking' }));

    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  it('lets consumers update the service status', async () => {
    render(
      <DashboardTopbarStatusProvider initialServiceStatus="INACTIVE">
        <Probe />
      </DashboardTopbarStatusProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'service' }));

    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });
});
