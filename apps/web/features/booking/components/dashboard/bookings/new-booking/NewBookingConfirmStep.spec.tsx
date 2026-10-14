// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { NewBookingConfirmStep } from './NewBookingConfirmStep';

function renderStep(status: 'idle' | 'submitting' | 'success' | 'error' = 'idle') {
  const onSubmit = vi.fn();
  const onBack = vi.fn();
  renderWithIntl(
    <NewBookingConfirmStep
      status={status}
      summary={<p>Recapitulação</p>}
      onBack={onBack}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, onBack };
}

describe('NewBookingConfirmStep', () => {
  it('recaps the booking and says it is created already approved', () => {
    renderStep();

    expect(screen.getByText('Recapitulação')).toBeInTheDocument();
    expect(screen.getByText(/criada já aprovada/)).toBeInTheDocument();
  });

  it('creates the booking from the action rail', async () => {
    const { onSubmit } = renderStep();

    await userEvent.click(screen.getAllByTestId('step-next')[0]!);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(screen.getAllByText('Criar agendamento').length).toBeGreaterThan(0);
  });

  it('locks the actions while the request is in flight', () => {
    renderStep('submitting');

    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();
    expect(screen.queryByTestId('step-back')).not.toBeInTheDocument();
  });

  it('goes back to the previous step', async () => {
    const { onBack } = renderStep();

    await userEvent.click(screen.getAllByTestId('step-back')[0]!);

    expect(onBack).toHaveBeenCalledOnce();
  });
});
