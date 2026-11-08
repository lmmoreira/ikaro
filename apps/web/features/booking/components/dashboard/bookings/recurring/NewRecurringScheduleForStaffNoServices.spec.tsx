// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { NewRecurringScheduleForStaffNoServices } from './NewRecurringScheduleForStaffNoServices';

describe('NewRecurringScheduleForStaffNoServices', () => {
  it('tells staff no service has recurrence on, and links to Serviços and a one-off booking for the customer', () => {
    renderWithIntl(
      <NewRecurringScheduleForStaffNoServices
        reason="NONE_ENABLED"
        customerId="cust 1"
        customerName="Ana Costa"
      />,
    );

    expect(screen.getByText('Nenhum serviço permite reserva recorrente no momento.')).toBeVisible();
    expect(screen.getByText(/agendamento avulso para Ana Costa/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Ver serviços' })).toHaveAttribute(
      'href',
      '/dashboard/services',
    );
    expect(screen.getByRole('link', { name: 'Fazer um agendamento' })).toHaveAttribute(
      'href',
      '/dashboard/bookings/new/booking?customerId=cust%201',
    );
  });

  it('tells staff some services have recurrence on but none qualifies', () => {
    renderWithIntl(
      <NewRecurringScheduleForStaffNoServices
        reason="NONE_QUALIFY"
        customerId="cust-1"
        customerName="Ana Costa"
      />,
    );

    expect(
      screen.getByText('Os serviços com recorrência ainda não aceitam reserva recorrente.'),
    ).toBeVisible();
    expect(screen.getByText(/nenhum atende à regra/)).toBeVisible();
    expect(screen.queryByText('Nenhum serviço permite reserva recorrente no momento.')).toBeNull();
  });
});
