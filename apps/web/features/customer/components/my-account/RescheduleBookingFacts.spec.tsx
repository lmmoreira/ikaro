// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RescheduleBookingFacts } from './RescheduleBookingFacts';

const WHEN = {
  start: new Date('2030-06-20T13:00:00.000Z'),
  end: new Date('2030-06-20T14:00:00.000Z'),
};

describe('RescheduleBookingFacts', () => {
  it('shows service, time window, and duration with price', () => {
    renderWithIntl(
      <RescheduleBookingFacts
        serviceNames="Lavagem Completa"
        when={WHEN}
        durationMins={60}
        price={180}
      />,
    );

    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
    expect(screen.getByText(/10:00–11:00/)).toBeInTheDocument();
    expect(screen.getByText(/60 min|1h/)).toBeInTheDocument();
    expect(screen.queryByText('Antes')).not.toBeInTheDocument();
  });

  it('shows the previous time struck through and flags the price as unchanged', () => {
    renderWithIntl(
      <RescheduleBookingFacts
        serviceNames="Lavagem Completa"
        when={WHEN}
        durationMins={60}
        price={180}
        before={{
          start: new Date('2030-06-18T13:00:00.000Z'),
          end: new Date('2030-06-18T14:00:00.000Z'),
        }}
      />,
    );

    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByText(/sem alteração/)).toBeInTheDocument();
  });
});
