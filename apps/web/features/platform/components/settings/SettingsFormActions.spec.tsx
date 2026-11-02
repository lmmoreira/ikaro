// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { SettingsActionPane } from './SettingsFormActions';

describe('SettingsActionPane', () => {
  it('disables both save buttons while submitting', () => {
    const { rerender } = renderWithIntl(
      <SettingsActionPane isSubmitting={false} feedback={null} />,
    );
    expect(screen.getByTestId('settings-submit-desktop')).not.toBeDisabled();
    expect(screen.getByTestId('settings-submit-mobile')).not.toBeDisabled();

    rerender(<SettingsActionPane isSubmitting feedback={null} />);
    expect(screen.getByTestId('settings-submit-desktop')).toBeDisabled();
    expect(screen.getByTestId('settings-submit-mobile')).toBeDisabled();
  });

  it('shows the action hint in the desktop pane only', () => {
    renderWithIntl(<SettingsActionPane isSubmitting={false} feedback={null} />);

    expect(
      within(screen.getByTestId('action-pane-desktop')).getByText(/As configurações afetam/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('action-pane-mobile')).queryByText(/As configurações afetam/),
    ).not.toBeInTheDocument();
  });

  it('renders no feedback card while there is no message', () => {
    renderWithIntl(<SettingsActionPane isSubmitting={false} feedback={null} />);

    expect(screen.queryByTestId('form-feedback')).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-feedback-mobile')).not.toBeInTheDocument();
  });

  it('puts an error under the buttons in the pane and in the mobile bar, announced as an alert', () => {
    renderWithIntl(
      <SettingsActionPane isSubmitting={false} feedback={{ variant: 'error', title: 'Falhou' }} />,
    );

    expect(screen.getByTestId('form-feedback')).toHaveAttribute('role', 'alert');
    expect(within(screen.getByTestId('action-pane-desktop')).getByText('Falhou')).toBeVisible();
    expect(within(screen.getByTestId('action-pane-mobile')).getByText('Falhou')).toBeVisible();
  });

  it('renders a success with its body as a status message', () => {
    renderWithIntl(
      <SettingsActionPane
        isSubmitting={false}
        feedback={{ variant: 'success', title: 'Salvo!', body: 'Aplicado.' }}
      />,
    );

    const feedback = screen.getByTestId('form-feedback');
    expect(feedback.tagName).toBe('OUTPUT');
    expect(feedback).toHaveTextContent('Salvo!');
    expect(feedback).toHaveTextContent('Aplicado.');
  });
});
