// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { NewRecurringScheduleNoServices } from './NewRecurringScheduleNoServices';

describe('NewRecurringScheduleNoServices', () => {
  it('says no service permits recurrence when none has it enabled', () => {
    renderWithIntl(
      <NewRecurringScheduleNoServices tenantSlug="lavacar-bh" reason="NONE_ENABLED" />,
    );

    expect(screen.getByTestId('new-schedule-no-services')).toHaveTextContent(
      'Nenhum serviço permite reserva recorrente no momento.',
    );
  });

  it('points to the business when recurrence is on but no service qualifies, without a technical reason', () => {
    renderWithIntl(
      <NewRecurringScheduleNoServices tenantSlug="lavacar-bh" reason="NONE_QUALIFY" />,
    );

    const empty = screen.getByTestId('new-schedule-no-services');
    expect(empty).toHaveTextContent(
      'Os serviços com recorrência ainda não aceitam reserva recorrente.',
    );
    expect(empty).toHaveTextContent('Fale com o estabelecimento');
    expect(empty).not.toHaveTextContent(/etapas|profissional|endereço/);
  });

  it('offers a one-off booking in this tenant from either state', () => {
    renderWithIntl(
      <NewRecurringScheduleNoServices tenantSlug="lavacar-bh" reason="NONE_ENABLED" />,
    );

    expect(screen.getByRole('link', { name: 'Fazer um agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/booking',
    );
  });

  it('renders the renewal notice under the heading', () => {
    renderWithIntl(
      <NewRecurringScheduleNoServices
        tenantSlug="lavacar-bh"
        reason="NONE_ENABLED"
        header={<p data-testid="notice">aviso</p>}
      />,
    );

    expect(screen.getByTestId('notice')).toBeInTheDocument();
  });
});
