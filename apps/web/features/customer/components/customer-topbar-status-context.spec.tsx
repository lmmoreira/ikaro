// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  CustomerTopbarStatusProvider,
  useCustomerTopbarStatus,
} from './customer-topbar-status-context';

function Probe(): React.JSX.Element {
  const status = useCustomerTopbarStatus();

  return (
    <div>
      <p>{status?.bookingStatus ?? 'none'}</p>
      <p>{status?.backHrefOverride ?? 'href-none'}</p>
      <p>{status?.backLabelOverride ?? 'label-none'}</p>
      <button type="button" onClick={() => status?.setBookingStatus('APPROVED')}>
        booking
      </button>
      <button
        type="button"
        onClick={() => status?.setBackHrefOverride('/lavacar-bh/my-account/bookings')}
      >
        href
      </button>
      <button type="button" onClick={() => status?.setBackLabelOverride('Agendamentos')}>
        label
      </button>
    </div>
  );
}

describe('CustomerTopbarStatusProvider', () => {
  it('starts with no override state', () => {
    render(
      <CustomerTopbarStatusProvider>
        <Probe />
      </CustomerTopbarStatusProvider>,
    );

    expect(screen.getByText('none')).toBeInTheDocument();
    expect(screen.getByText('href-none')).toBeInTheDocument();
    expect(screen.getByText('label-none')).toBeInTheDocument();
  });

  it('lets consumers update the booking status', async () => {
    render(
      <CustomerTopbarStatusProvider>
        <Probe />
      </CustomerTopbarStatusProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'booking' }));

    expect(screen.getByText('APPROVED')).toBeInTheDocument();
  });

  it('lets consumers update the back href and label overrides', async () => {
    render(
      <CustomerTopbarStatusProvider>
        <Probe />
      </CustomerTopbarStatusProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'href' }));
    await userEvent.click(screen.getByRole('button', { name: 'label' }));

    expect(screen.getByText('/lavacar-bh/my-account/bookings')).toBeInTheDocument();
    expect(screen.getByText('Agendamentos')).toBeInTheDocument();
  });

  it('returns null outside the provider', () => {
    function OutsideProbe(): React.JSX.Element {
      const status = useCustomerTopbarStatus();
      return <p>{status === null ? 'null' : 'not-null'}</p>;
    }
    render(<OutsideProbe />);

    expect(screen.getByText('null')).toBeInTheDocument();
  });
});
