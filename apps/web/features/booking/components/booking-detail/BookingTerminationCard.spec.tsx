// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { BookingTerminationCard } from './BookingTerminationCard';

const AT = '2026-06-16T11:40:00.000Z';

describe('BookingTerminationCard', () => {
  it('shows who cancelled, when and why', () => {
    renderWithIntl(
      <BookingTerminationCard
        kind="cancellation"
        audience="staff"
        at={AT}
        reason="Equipamento em manutenção."
        actorLabel="Ana Pereira (equipe)"
      />,
    );

    expect(screen.getByText('Cancelamento')).toBeInTheDocument();
    expect(screen.getByText('Cancelado por')).toBeInTheDocument();
    expect(screen.getByText('Ana Pereira (equipe)')).toBeInTheDocument();
    expect(screen.getByText(/às \d{2}:\d{2}/)).toBeInTheDocument();
    expect(screen.getByText('Equipamento em manutenção.')).toBeInTheDocument();
  });

  it.each([null, '', '   '])('shows no reason row when there is none (%j)', (reason) => {
    renderWithIntl(
      <BookingTerminationCard
        kind="cancellation"
        audience="customer"
        at={AT}
        reason={reason}
        actorLabel="Você"
      />,
    );

    expect(screen.getByText('Você')).toBeInTheDocument();
    expect(screen.queryByText('Motivo')).not.toBeInTheDocument();
  });

  it('titles a rejection "Rejeição" for staff and "Recusa" for the customer', () => {
    const { rerender } = renderWithIntl(
      <BookingTerminationCard
        kind="rejection"
        audience="staff"
        at={AT}
        reason="Sem vaga"
        actorLabel="Equipe"
      />,
    );
    expect(screen.getByText('Rejeição')).toBeInTheDocument();
    expect(screen.getByText('Recusado por')).toBeInTheDocument();

    rerender(
      <BookingTerminationCard
        kind="rejection"
        audience="customer"
        at={AT}
        reason="Sem vaga"
        actorLabel="O estabelecimento"
      />,
    );
    expect(screen.getByText('Recusa')).toBeInTheDocument();
  });
});
