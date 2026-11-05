// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { AvailabilityAlertFormMessages } from './AvailabilityAlertFormMessages';

describe('AvailabilityAlertFormMessages', () => {
  it('renders nothing while the form is valid and nothing failed', () => {
    renderWithIntl(
      <AvailabilityAlertFormMessages
        hasFieldErrors={false}
        rejectedSubmits={0}
        submitError={null}
      />,
    );

    expect(screen.queryByTestId('alert-validation-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alert-submit-error')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('summarises refused fields as the one form-level alert, focused', () => {
    renderWithIntl(
      <AvailabilityAlertFormMessages hasFieldErrors rejectedSubmits={1} submitError={null} />,
    );

    const alert = within(screen.getByTestId('alert-validation-error')).getByRole('alert');
    expect(alert).toHaveTextContent('Corrija os campos destacados acima antes de criar o aviso.');
    expect(alert).toHaveFocus();
    expect(screen.queryByTestId('alert-submit-error')).not.toBeInTheDocument();
  });

  it('remounts the summary for each refusal so the same errors are announced again', () => {
    const { rerender } = renderWithIntl(
      <AvailabilityAlertFormMessages hasFieldErrors rejectedSubmits={1} submitError={null} />,
    );
    const first = screen.getByRole('alert');
    first.blur();

    rerender(
      <AvailabilityAlertFormMessages hasFieldErrors rejectedSubmits={2} submitError={null} />,
    );

    const second = screen.getByRole('alert');
    expect(second).not.toBe(first);
    expect(second).toHaveFocus();
  });

  it('shows a failed save with its hint, apart from the validation summary', () => {
    renderWithIntl(
      <AvailabilityAlertFormMessages
        hasFieldErrors={false}
        rejectedSubmits={0}
        submitError="Não foi possível criar o aviso."
      />,
    );

    const alert = within(screen.getByTestId('alert-submit-error')).getByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível criar o aviso.');
    expect(alert).toHaveTextContent('Verifique sua conexão e tente de novo. Nada foi salvo.');
    expect(screen.queryByTestId('alert-validation-error')).not.toBeInTheDocument();
  });
});
