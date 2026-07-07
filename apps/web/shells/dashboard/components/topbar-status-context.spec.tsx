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
      <p>{status?.staffRoleStatus ?? 'none'}</p>
      <p>{status?.backLabelOverride ?? 'back-none'}</p>
      <p>{status?.pageTitleOverride ?? 'title-none'}</p>
      <p>{status?.onBackOverride ? 'onback-set' : 'onback-none'}</p>
      <button type="button" onClick={() => status?.setBookingStatus('APPROVED')}>
        booking
      </button>
      <button type="button" onClick={() => status?.setServiceStatus('ACTIVE')}>
        service
      </button>
      <button type="button" onClick={() => status?.setStaffRoleStatus('MANAGER')}>
        staff-role
      </button>
      <button type="button" onClick={() => status?.setBackLabelOverride('Fidelidade')}>
        back-label
      </button>
      <button type="button" onClick={() => status?.setPageTitleOverride('João Silva')}>
        title
      </button>
      <button type="button" onClick={() => status?.setOnBackOverride(() => () => {})}>
        set-onback
      </button>
      <button type="button" onClick={() => status?.setOnBackOverride(null)}>
        clear-onback
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

  it('exposes the initial staff role status to consumers', () => {
    render(
      <DashboardTopbarStatusProvider initialStaffRoleStatus="STAFF">
        <Probe />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByText('STAFF')).toBeInTheDocument();
  });

  it('lets consumers update the staff role status', async () => {
    render(
      <DashboardTopbarStatusProvider initialStaffRoleStatus="STAFF">
        <Probe />
      </DashboardTopbarStatusProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'staff-role' }));

    expect(screen.getByText('MANAGER')).toBeInTheDocument();
  });

  it('lets consumers update the back label and page title overrides', async () => {
    render(
      <DashboardTopbarStatusProvider>
        <Probe />
      </DashboardTopbarStatusProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'back-label' }));
    await userEvent.click(screen.getByRole('button', { name: 'title' }));

    expect(screen.getByText('Fidelidade')).toBeInTheDocument();
    expect(screen.getByText('João Silva')).toBeInTheDocument();
  });

  it('lets consumers set and clear the onBack override', async () => {
    render(
      <DashboardTopbarStatusProvider>
        <Probe />
      </DashboardTopbarStatusProvider>,
    );

    expect(screen.getByText('onback-none')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'set-onback' }));
    expect(screen.getByText('onback-set')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'clear-onback' }));
    expect(screen.getByText('onback-none')).toBeInTheDocument();
  });
});
