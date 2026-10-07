// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RescheduleSuccessView } from './RescheduleSuccessView';

describe('RescheduleSuccessView', () => {
  it('confirms the booking stays approved and shows the old and new time', () => {
    renderWithIntl(
      <RescheduleSuccessView
        serviceNames="Lavagem Completa"
        when={{
          start: new Date('2030-06-23T13:00:00.000Z'),
          end: new Date('2030-06-23T14:00:00.000Z'),
        }}
        before={{
          start: new Date('2030-06-20T13:00:00.000Z'),
          end: new Date('2030-06-20T14:00:00.000Z'),
        }}
        durationMins={60}
        price={180}
        bookingHref="/lavacar-bh/my-account/bookings/b1"
        bookingsHref="/lavacar-bh/my-account/bookings"
      />,
    );

    expect(screen.getByTestId('reschedule-success')).toHaveTextContent('Agendamento reagendado!');
    expect(screen.getByTestId('reschedule-success')).toHaveTextContent(
      'Seu agendamento continua aprovado.',
    );
    expect(screen.getByText('Antes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1',
    );
    expect(screen.getByRole('link', { name: 'Meus agendamentos' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings',
    );
  });
});
