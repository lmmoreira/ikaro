// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RescheduleKeptPicks } from './RescheduleKeptPicks';

describe('RescheduleKeptPicks', () => {
  it('renders nothing when the booking has no kept pick', () => {
    renderWithIntl(<RescheduleKeptPicks keptPicks={[]} />);

    expect(screen.queryByTestId('reschedule-kept-picks')).not.toBeInTheDocument();
  });

  it('names a journey pick by its leg and a flat pick by its service, with the resource name', () => {
    renderWithIntl(
      <RescheduleKeptPicks
        keptPicks={[
          {
            serviceName: 'Jornada Spa Vitta',
            legName: 'Massagem',
            legIndex: 0,
            resourceType: 'STAFF',
            resourceName: 'Renata Souza',
          },
          {
            serviceName: 'Quadra',
            legName: null,
            legIndex: null,
            resourceType: 'EQUIPMENT',
            resourceName: 'Poltrona 1',
          },
        ]}
      />,
    );

    expect(screen.getByText('Massagem · Profissional')).toBeInTheDocument();
    expect(screen.getByText('Renata Souza')).toBeInTheDocument();
    expect(screen.getByText('Quadra · Equipamento')).toBeInTheDocument();
    expect(screen.getByText('Poltrona 1')).toBeInTheDocument();
    expect(
      screen.getByText(/cancele este agendamento e faça uma nova reserva/),
    ).toBeInTheDocument();
  });
});
