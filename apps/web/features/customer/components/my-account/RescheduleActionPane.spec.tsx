// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RescheduleActionPane } from './RescheduleActionPane';

const FROM = {
  start: new Date('2030-06-20T13:00:00.000Z'),
  end: new Date('2030-06-20T14:00:00.000Z'),
};
const TO = {
  start: new Date('2030-06-23T13:00:00.000Z'),
  end: new Date('2030-06-23T14:00:00.000Z'),
};

function renderPane(overrides: Partial<React.ComponentProps<typeof RescheduleActionPane>> = {}) {
  const onConfirm = vi.fn();
  renderWithIntl(
    <RescheduleActionPane
      from={FROM}
      to={TO}
      eligibleUntil={new Date('2030-06-18T13:00:00.000Z')}
      isSubmitting={false}
      backHref="/lavacar-bh/my-account/bookings/b1"
      onConfirm={onConfirm}
      {...overrides}
    />,
  );
  return onConfirm;
}

describe('RescheduleActionPane', () => {
  it('shows the De/Para summary and enables confirming once a slot is chosen', async () => {
    const onConfirm = renderPane();

    expect(screen.getByTestId('reschedule-change-summary')).toHaveTextContent(/De: .*10:00–11:00/);
    expect(screen.getByTestId('reschedule-change-summary')).toHaveTextContent(
      /Para: .*10:00–11:00/,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Confirmar novo horário' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('keeps confirm disabled and hides the summary before a slot is chosen', () => {
    renderPane({ to: null });

    expect(screen.queryByTestId('reschedule-change-summary')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar novo horário' })).toBeDisabled();
  });

  it('disables confirm and shows the in-flight label while submitting', () => {
    renderPane({ isSubmitting: true });

    expect(screen.getByRole('button', { name: 'Reagendando...' })).toBeDisabled();
  });

  it('links back to the booking and shows the reschedule deadline', () => {
    renderPane();

    expect(screen.getByRole('link', { name: 'Voltar ao agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1',
    );
    expect(screen.getByText(/Você pode reagendar até/)).toBeInTheDocument();
  });
});
