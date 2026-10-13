// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { NewBookingStepLayout } from './NewBookingStepLayout';

describe('NewBookingStepLayout', () => {
  it('renders the step, the summary (desktop) and the actions', () => {
    renderWithIntl(
      <NewBookingStepLayout summary={<p>Resumo X</p>} onBack={vi.fn()} onNext={vi.fn()}>
        <p>Conteúdo do passo</p>
      </NewBookingStepLayout>,
    );

    expect(screen.getByText('Conteúdo do passo')).toBeInTheDocument();
    expect(screen.getAllByText('Resumo X').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('step-next').length).toBeGreaterThan(0);
  });

  it('fires the step’s handlers and honours its gate', async () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    const { rerender } = renderWithIntl(
      <NewBookingStepLayout summary={null} onBack={onBack} onNext={onNext} nextDisabled>
        <p>x</p>
      </NewBookingStepLayout>,
    );
    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();

    rerender(
      <NewBookingStepLayout summary={null} onBack={onBack} onNext={onNext}>
        <p>x</p>
      </NewBookingStepLayout>,
    );
    await userEvent.click(screen.getAllByTestId('step-next')[0]!);
    await userEvent.click(screen.getAllByTestId('step-back')[0]!);

    expect(onNext).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('omits "Voltar" when there is nowhere to go back to, and takes a custom label', () => {
    renderWithIntl(
      <NewBookingStepLayout summary={null} onBack={null} onNext={vi.fn()} nextLabel="Criar">
        <p>x</p>
      </NewBookingStepLayout>,
    );

    expect(screen.queryByTestId('step-back')).not.toBeInTheDocument();
    expect(screen.getAllByText('Criar').length).toBeGreaterThan(0);
  });
});
