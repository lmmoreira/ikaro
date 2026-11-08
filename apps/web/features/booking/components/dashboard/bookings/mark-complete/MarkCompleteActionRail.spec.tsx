// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { MarkCompleteActionRail } from './MarkCompleteActionRail';

describe('MarkCompleteActionRail', () => {
  it('shows the error message when error is set', () => {
    renderWithIntl(
      <MarkCompleteActionRail
        error="Falha ao concluir"
        isSubmitting={false}
        backHref="/dashboard/bookings"
      />,
    );

    expect(screen.getAllByText('Falha ao concluir').length).toBeGreaterThan(0);
  });

  it('omits the error card when error is null', () => {
    renderWithIntl(
      <MarkCompleteActionRail error={null} isSubmitting={false} backHref="/dashboard/bookings" />,
    );

    expect(screen.queryByText('Falha ao concluir')).not.toBeInTheDocument();
  });

  it('disables the submit button while isSubmitting is true', () => {
    renderWithIntl(
      <MarkCompleteActionRail error={null} isSubmitting backHref="/dashboard/bookings" />,
    );

    expect(screen.getAllByRole('button', { name: 'Confirmar conclusão' })[0]).toBeDisabled();
  });

  it('links the cancel action to backHref', () => {
    renderWithIntl(
      <MarkCompleteActionRail
        error={null}
        isSubmitting={false}
        backHref="/dashboard/bookings/b-1"
      />,
    );

    expect(screen.getAllByRole('link', { name: 'Cancelar' })[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings/b-1',
    );
  });

  it('reports a failure under the buttons of the pane (desktop) and above them in the mobile bar', () => {
    renderWithIntl(
      <MarkCompleteActionRail
        error="Falha ao concluir"
        isSubmitting={false}
        backHref="/dashboard/bookings"
      />,
    );

    const feedback = screen.getByTestId('mark-complete-error');
    expect(feedback).toHaveAttribute('role', 'alert');
    expect(feedback).toHaveTextContent('Falha ao concluir');
    const desktopPane = screen.getByTestId('action-pane-desktop');
    const submit = within(desktopPane).getByRole('button', { name: 'Confirmar conclusão' });
    expect(desktopPane).toContainElement(feedback);
    expect(
      submit.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId('action-pane-mobile')).toContainElement(
      screen.getByTestId('mark-complete-error-mobile'),
    );
  });

  it('renders no feedback card without an error', () => {
    renderWithIntl(
      <MarkCompleteActionRail error={null} isSubmitting={false} backHref="/dashboard/bookings" />,
    );

    expect(screen.queryByTestId('mark-complete-error')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
