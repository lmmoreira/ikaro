// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ResourceFormActionPane } from './ResourceFormActionPane';

describe('ResourceFormActionPane', () => {
  it('renders the save button twice, once per layout, with their own test ids', () => {
    renderWithIntl(
      <ResourceFormActionPane
        submitLabel="Criar recurso"
        desktopSaveTestId="resource-create-save-desktop"
        mobileSaveTestId="resource-create-save-mobile"
        isSubmitting={false}
        feedback={null}
      />,
    );

    expect(screen.getByTestId('resource-create-save-desktop')).toHaveTextContent('Criar recurso');
    expect(screen.getByTestId('resource-create-save-mobile')).toHaveTextContent('Criar recurso');
  });

  it('links Cancelar back to the resource list from both layouts', () => {
    renderWithIntl(
      <ResourceFormActionPane
        submitLabel="Salvar alterações"
        desktopSaveTestId="resource-edit-save-desktop"
        mobileSaveTestId="resource-edit-save-mobile"
        isSubmitting={false}
        feedback={null}
      />,
    );

    const links = screen.getAllByRole('link', { name: 'Cancelar' });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', '/dashboard/resources');
  });

  it('disables both save buttons while a submit is in flight', () => {
    renderWithIntl(
      <ResourceFormActionPane
        submitLabel="Criar recurso"
        desktopSaveTestId="resource-create-save-desktop"
        mobileSaveTestId="resource-create-save-mobile"
        isSubmitting
        feedback={null}
      />,
    );

    expect(screen.getByTestId('resource-create-save-desktop')).toBeDisabled();
    expect(screen.getByTestId('resource-create-save-mobile')).toBeDisabled();
  });

  it('shows no feedback card without a message', () => {
    renderWithIntl(
      <ResourceFormActionPane
        submitLabel="Criar recurso"
        desktopSaveTestId="resource-create-save-desktop"
        mobileSaveTestId="resource-create-save-mobile"
        isSubmitting={false}
        feedback={null}
      />,
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the form-level message under the buttons in the desktop pane, as an alert', () => {
    renderWithIntl(
      <ResourceFormActionPane
        submitLabel="Criar recurso"
        desktopSaveTestId="resource-create-save-desktop"
        mobileSaveTestId="resource-create-save-mobile"
        isSubmitting={false}
        feedback={{ variant: 'error', title: 'Não foi possível salvar.' }}
      />,
    );

    const pane = screen.getByTestId('action-pane-desktop');
    const message = within(pane).getByTestId('form-feedback');
    expect(message).toHaveAttribute('role', 'alert');
    expect(message).toHaveTextContent('Não foi possível salvar.');
  });
});
