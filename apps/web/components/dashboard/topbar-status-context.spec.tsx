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
      <button type="button" onClick={() => status?.setBookingStatus('APPROVED')}>
        update
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

  it('lets consumers update the booking status', async () => {
    render(
      <DashboardTopbarStatusProvider initialBookingStatus="PENDING">
        <Probe />
      </DashboardTopbarStatusProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'update' }));

    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });
});
