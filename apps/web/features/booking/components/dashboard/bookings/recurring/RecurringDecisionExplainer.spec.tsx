// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RecurringDecisionExplainer } from './RecurringDecisionExplainer';

describe('RecurringDecisionExplainer', () => {
  it('explains approving (with the most reservations it can create) and rejecting, naming the customer', () => {
    renderWithIntl(
      <RecurringDecisionExplainer customerName="Ana Costa" maxCount={13} holdExpired={false} />,
    );

    const card = screen.getByTestId('recurring-what-happens');
    expect(card).toHaveTextContent('Nenhuma reserva foi criada ainda.');
    expect(card).toHaveTextContent('A decisão vale para o padrão inteiro, não por semana.');
    expect(card).toHaveTextContent('cria as reservas do período (até 13) de uma vez');
    expect(card).toHaveTextContent('Ana Costa pode enviar um novo pedido quando quiser.');
    expect(card).toHaveTextContent('Ana Costa recebe um email com o resultado.');
  });

  it('leaves out the approval paragraph once the hold has passed, and still explains rejecting', () => {
    renderWithIntl(
      <RecurringDecisionExplainer customerName="Ana Costa" maxCount={13} holdExpired />,
    );

    const card = screen.getByTestId('recurring-what-happens');
    expect(card).not.toHaveTextContent('cria as reservas do período');
    expect(card).toHaveTextContent('não cria nada e não pode ser desfeito');
  });
});
