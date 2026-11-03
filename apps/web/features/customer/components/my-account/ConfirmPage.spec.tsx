// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import { ConfirmPage } from './ConfirmPage';

const FAILURE: FeedbackModel = { variant: 'error', title: 'Não foi possível cancelar' };

function renderPage(
  overrides: Partial<React.ComponentProps<typeof ConfirmPage>> = {},
): ReturnType<typeof vi.fn>[] {
  const onConfirm = vi.fn();
  const onKeep = vi.fn();
  render(
    <ConfirmPage
      testId="confirm-page"
      title="Cancelar agendamento?"
      subtitle="Esta ação não pode ser desfeita."
      sectionLabel="Agendamento"
      summary={<p>Lavagem Completa</p>}
      notice="Cancelamentos com menos de 48 horas podem não ser aceitos."
      noticeTone="warning"
      asideNote="Tem certeza?"
      confirmLabel="Confirmar cancelamento"
      confirmTestId="confirm-button"
      keepLabel="Voltar"
      isSubmitting={false}
      onConfirm={onConfirm}
      onKeep={onKeep}
      feedback={null}
      feedbackTestId="confirm-error"
      {...overrides}
    />,
  );
  return [onConfirm, onKeep];
}

describe('ConfirmPage', () => {
  it('puts the title, the summary and the notice on the page', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Cancelar agendamento?' })).toBeTruthy();
    expect(screen.getByText('Esta ação não pode ser desfeita.')).toBeTruthy();
    expect(screen.getByText('Lavagem Completa')).toBeTruthy();
    expect(screen.getByText(/Cancelamentos com menos de 48 horas/)).toBeTruthy();
  });

  it('renders the actions in the sticky pane and in the mobile bar', () => {
    renderPage();

    const desktop = screen.getByTestId('action-pane-desktop');
    const mobile = screen.getByTestId('action-pane-mobile');
    expect(within(desktop).getByText('Tem certeza?')).toBeTruthy();
    expect(within(desktop).getByRole('button', { name: 'Confirmar cancelamento' })).toBeTruthy();
    expect(within(mobile).getByRole('button', { name: 'Voltar' })).toBeTruthy();
    expect(within(mobile).queryByText('Tem certeza?')).toBeNull();
  });

  it('calls the handlers from the desktop buttons', async () => {
    const [onConfirm, onKeep] = renderPage();
    const desktop = within(screen.getByTestId('action-pane-desktop'));

    await userEvent.click(desktop.getByRole('button', { name: 'Confirmar cancelamento' }));
    await userEvent.click(desktop.getByRole('button', { name: 'Voltar' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it('disables both actions while submitting', () => {
    renderPage({ isSubmitting: true });

    const desktop = within(screen.getByTestId('action-pane-desktop'));
    expect(
      desktop.getByRole('button', { name: 'Confirmar cancelamento' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(desktop.getByRole('button', { name: 'Voltar' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows a failure under the buttons with the given test id and no old inline box', () => {
    renderPage({ feedback: FAILURE });

    const desktop = within(screen.getByTestId('action-pane-desktop'));
    expect(desktop.getByRole('alert').textContent).toContain('Não foi possível cancelar');
    expect(screen.getByTestId('confirm-error')).toBeTruthy();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('renders no alert when there is no failure', () => {
    renderPage();

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
