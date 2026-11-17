// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl, renderWithIntlInCustomerTenantAccess } from '@/test-utils';
import { NewReservationMenu } from './NewReservationMenu';

function open(): void {
  fireEvent.click(screen.getByTestId('new-menu-trigger'));
}

describe('NewReservationMenu', () => {
  it('is closed until the trigger is pressed', () => {
    renderWithIntl(<NewReservationMenu tenantSlug="lavacar-bh" />);
    expect(screen.queryByTestId('new-menu')).toBeNull();
    expect(screen.getByTestId('new-menu-trigger')).toHaveTextContent('+ Novo');
  });

  it('offers the one-off booking and the recurring reservation, with their destinations', () => {
    renderWithIntl(<NewReservationMenu tenantSlug="lavacar-bh" />);
    open();

    const booking = screen.getByTestId('new-menu-booking');
    expect(booking).toHaveTextContent('Agendamento');
    expect(booking).toHaveTextContent('Reservar um horário avulso');
    expect(booking).toHaveAttribute('href', '/lavacar-bh/booking');

    const recurring = screen.getByTestId('new-menu-recurring');
    expect(recurring).toHaveTextContent('Reserva recorrente');
    expect(recurring).toHaveTextContent('Reservar o mesmo horário toda semana');
    expect(recurring).toHaveAttribute('href', '/lavacar-bh/my-account/recurring-schedules/new');
  });

  it('closes after an item is chosen', () => {
    renderWithIntl(<NewReservationMenu tenantSlug="lavacar-bh" />);
    open();
    fireEvent.click(screen.getByTestId('new-menu-recurring'));
    expect(screen.queryByTestId('new-menu')).toBeNull();
  });

  it('renders in English', () => {
    renderWithIntl(<NewReservationMenu tenantSlug="lavacar-bh" />, { locale: 'en' });
    open();
    expect(screen.getByTestId('new-menu-recurring')).toHaveTextContent('Recurring reservation');
  });

  it('stretches across its container when asked', () => {
    renderWithIntl(<NewReservationMenu tenantSlug="lavacar-bh" fullWidth />);
    expect(screen.getByTestId('new-menu-trigger').className).toContain('w-full');
  });
});

describe('NewReservationMenu while the tenant is suspended (UC-121)', () => {
  it('is a disabled button with no menu: neither a booking nor a recurring reservation can be created', () => {
    renderWithIntlInCustomerTenantAccess(<NewReservationMenu tenantSlug="lavacar-bh" />, {
      operational: false,
    });

    const button = screen.getByTestId('new-booking-disabled');
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('+ Novo');
    expect(screen.queryByTestId('new-menu-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-menu-recurring')).not.toBeInTheDocument();
  });

  it('keeps the full-width trigger shape for the mobile placement', () => {
    renderWithIntlInCustomerTenantAccess(<NewReservationMenu tenantSlug="lavacar-bh" fullWidth />, {
      operational: false,
    });

    expect(screen.getByTestId('new-booking-disabled').className).toContain('w-full');
  });

  it('is the usual menu for an operational tenant (negative guarantee)', () => {
    renderWithIntl(<NewReservationMenu tenantSlug="lavacar-bh" />);

    expect(screen.getByTestId('new-menu-trigger')).toBeEnabled();
    expect(screen.queryByTestId('new-booking-disabled')).not.toBeInTheDocument();
  });

  it('is absent, not disabled, for a tenant without BOOKING', () => {
    renderWithIntlInCustomerTenantAccess(<NewReservationMenu tenantSlug="lavacar-bh" />, {
      entitledFeatures: ['LOYALTY'],
    });

    expect(screen.queryByTestId('new-menu-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('new-booking-disabled')).not.toBeInTheDocument();
  });

  it('is the usual menu when the tenant features are unknown (negative guarantee)', () => {
    renderWithIntlInCustomerTenantAccess(<NewReservationMenu tenantSlug="lavacar-bh" />, {
      entitledFeatures: null,
    });

    expect(screen.getByTestId('new-menu-trigger')).toBeEnabled();
  });
});
