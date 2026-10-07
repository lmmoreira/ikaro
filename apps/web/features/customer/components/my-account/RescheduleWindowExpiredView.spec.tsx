// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RescheduleWindowExpiredView } from './RescheduleWindowExpiredView';

function renderView(whatsapp: string | null) {
  renderWithIntl(
    <RescheduleWindowExpiredView
      serviceNames="Lavagem Completa"
      when={{
        start: new Date('2030-06-20T13:00:00.000Z'),
        end: new Date('2030-06-20T14:00:00.000Z'),
      }}
      durationMins={60}
      price={180}
      eligibleUntil={new Date('2030-06-18T13:00:00.000Z')}
      windowHours={48}
      whatsapp={whatsapp}
      backHref="/lavacar-bh/my-account/bookings/b1"
    />,
  );
}

describe('RescheduleWindowExpiredView', () => {
  it('explains the deadline with the booking own window hours', () => {
    renderView(null);

    expect(screen.getByRole('alert')).toHaveTextContent('Reagendamento fora do prazo');
    expect(screen.getByRole('alert')).toHaveTextContent('pelo menos 48 horas de antecedência');
    expect(screen.getByRole('alert')).toHaveTextContent(/O prazo de reagendamento encerrou em/);
  });

  it('offers WhatsApp contact when the business has a number', () => {
    renderView('+55 11 99999-0000');

    expect(screen.getByRole('link', { name: 'Contato via WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/5511999990000',
    );
  });

  it('omits the WhatsApp action when the business has none, keeping the way back', () => {
    renderView(null);

    expect(screen.queryByRole('link', { name: 'Contato via WhatsApp' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1',
    );
  });
});
