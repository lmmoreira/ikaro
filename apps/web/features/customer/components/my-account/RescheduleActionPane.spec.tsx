// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
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
      feedback={null}
      {...overrides}
    />,
  );
  return onConfirm;
}

const desktop = () => within(screen.getByTestId('action-pane-desktop'));

describe('RescheduleActionPane', () => {
  it('shows the De/Para summary and enables confirming once a slot is chosen', async () => {
    const onConfirm = renderPane();

    expect(desktop().getByTestId('reschedule-change-summary')).toHaveTextContent(
      /De: .*10:00–11:00/,
    );
    expect(desktop().getByTestId('reschedule-change-summary')).toHaveTextContent(
      /Para: .*10:00–11:00/,
    );

    await userEvent.click(desktop().getByRole('button', { name: 'Confirmar novo horário' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('keeps confirm disabled and hides the summary before a slot is chosen', () => {
    renderPane({ to: null });

    expect(desktop().queryByTestId('reschedule-change-summary')).not.toBeInTheDocument();
    expect(desktop().getByRole('button', { name: 'Confirmar novo horário' })).toBeDisabled();
  });

  it('disables confirm and shows the in-flight label while submitting', () => {
    renderPane({ isSubmitting: true });

    expect(desktop().getByRole('button', { name: 'Reagendando...' })).toBeDisabled();
  });

  it('links back to the booking and shows the reschedule deadline', () => {
    renderPane();

    expect(desktop().getByRole('link', { name: 'Voltar ao agendamento' })).toHaveAttribute(
      'href',
      '/lavacar-bh/my-account/bookings/b1',
    );
    expect(desktop().getByText(/Você pode reagendar até/)).toBeInTheDocument();
  });

  it('shows a failure as an alert under the buttons, in the pane and in the mobile bar', () => {
    renderPane({
      feedback: {
        variant: 'error',
        title: 'Não foi possível reagendar.',
        hint: 'Tente novamente.',
        testId: 'reschedule-error',
      },
    });

    expect(desktop().getByRole('alert')).toHaveTextContent('Não foi possível reagendar.');
    expect(desktop().getByRole('alert')).toHaveTextContent('Tente novamente.');
    expect(screen.getByTestId('reschedule-error')).toBe(desktop().getByRole('alert'));
    expect(within(screen.getByTestId('action-pane-mobile')).getByRole('alert')).toHaveTextContent(
      'Não foi possível reagendar.',
    );
  });

  it('shows no alert while there is no failure', () => {
    renderPane();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the summary and the deadline out of the mobile bar (the page shows them below lg)', () => {
    renderPane();

    const mobile = within(screen.getByTestId('action-pane-mobile'));
    expect(mobile.queryByTestId('reschedule-change-summary')).not.toBeInTheDocument();
    expect(mobile.queryByText(/Você pode reagendar até/)).not.toBeInTheDocument();
  });
});
