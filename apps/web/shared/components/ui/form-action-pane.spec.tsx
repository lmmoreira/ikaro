// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormActionPane } from './form-action-pane';

const BASE_PROPS = {
  submitLabel: 'Criar recurso',
  cancelLabel: 'Cancelar',
  cancelHref: '/dashboard/resources',
  desktopSaveTestId: 'save-desktop',
  mobileSaveTestId: 'save-mobile',
  isSubmitting: false,
  feedback: null,
} as const;

describe('FormActionPane', () => {
  it('renders the save button twice, once per layout, with their own test ids', () => {
    render(<FormActionPane {...BASE_PROPS} />);

    expect(screen.getByTestId('save-desktop')).toHaveTextContent('Criar recurso');
    expect(screen.getByTestId('save-mobile')).toHaveTextContent('Criar recurso');
  });

  it('links the cancel action to the given target from both layouts', () => {
    render(<FormActionPane {...BASE_PROPS} cancelHref="/dashboard/team" />);

    const links = screen.getAllByRole('link', { name: 'Cancelar' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/dashboard/team');
  });

  it('disables both save buttons while a submit is in flight', () => {
    render(<FormActionPane {...BASE_PROPS} isSubmitting />);

    expect(screen.getByTestId('save-desktop')).toBeDisabled();
    expect(screen.getByTestId('save-mobile')).toBeDisabled();
  });

  it('shows no feedback card without a message', () => {
    render(<FormActionPane {...BASE_PROPS} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the form-level message under the buttons in the desktop pane, as an alert', () => {
    render(
      <FormActionPane
        {...BASE_PROPS}
        feedback={{ variant: 'error', title: 'Não foi possível salvar.' }}
      />,
    );

    const message = within(screen.getByTestId('action-pane-desktop')).getByTestId('form-feedback');
    expect(message).toHaveAttribute('role', 'alert');
    expect(message).toHaveTextContent('Não foi possível salvar.');
  });

  it('shows the hint in the desktop pane only', () => {
    render(<FormActionPane {...BASE_PROPS} hint="O convite expira em 7 dias." />);

    expect(
      within(screen.getByTestId('action-pane-desktop')).getByText('O convite expira em 7 dias.'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('action-pane-mobile')).queryByText('O convite expira em 7 dias.'),
    ).not.toBeInTheDocument();
  });

  it('renders no hint when none is given', () => {
    render(<FormActionPane {...BASE_PROPS} />);

    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
});
