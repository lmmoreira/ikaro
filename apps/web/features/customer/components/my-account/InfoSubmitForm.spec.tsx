// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InfoSubmitButton, InfoSubmitForm, useInfoSubmit } from './InfoSubmitForm';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      label: 'Mensagem',
      submit: 'Enviar resposta',
      submitting: 'Enviando...',
      retry: 'Tentar novamente',
      infoNeeded: 'O estabelecimento precisa de informações',
      validationError: 'Informe sua resposta antes de enviar.',
      submitError: 'Não foi possível enviar sua resposta. Verifique sua conexão e tente novamente.',
      photoUploadTitle: 'Fotos (opcional)',
      photoClickToAdd: 'Clique para adicionar fotos',
      photoFormatHint: 'JPG ou PNG',
    };
    return translations[key] ?? key;
  },
}));

const submitInfoMock = vi.fn();
vi.mock('@/features/booking/api/customer', () => ({
  submitBookingInfoAsCustomer: (...args: unknown[]) => submitInfoMock(...args),
}));

/** The page's wiring: the fields in the page, the button and the failure in the action pane. */
function Harness({ onSubmitted }: Readonly<{ onSubmitted: () => void }>): React.JSX.Element {
  const controller = useInfoSubmit({ bookingId: 'b1', onSubmitted });
  return (
    <>
      <InfoSubmitForm infoRequestMessage="Envie fotos do veículo" controller={controller} />
      <aside data-testid="pane">
        <InfoSubmitButton controller={controller} />
        {controller.feedback && (
          <p role="alert" data-testid={controller.feedback.testId}>
            {controller.feedback.title}
          </p>
        )}
      </aside>
    </>
  );
}

describe('InfoSubmitForm', () => {
  beforeEach(() => {
    submitInfoMock.mockReset();
  });

  it('shows what the business asked, under the business heading', () => {
    render(<Harness onSubmitted={vi.fn()} />);

    const request = screen.getByTestId('info-request-message');
    expect(request).toHaveTextContent('O estabelecimento precisa de informações');
    expect(request).toHaveTextContent('Envie fotos do veículo');
  });

  it('marks the empty textarea, shows the message under it and does not submit', async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSubmitted={onSubmitted} />);

    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    const textarea = screen.getByLabelText('Mensagem');
    expect(screen.getByTestId('info-validation-error')).toHaveTextContent(
      'Informe sua resposta antes de enviar.',
    );
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(textarea).toHaveAttribute('aria-describedby');
    await waitFor(() => expect(textarea).toHaveFocus());
    // A field problem is not a form-level failure: nothing appears in the pane.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(submitInfoMock).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('removes the field message as soon as the customer types', async () => {
    const user = userEvent.setup();
    render(<Harness onSubmitted={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    expect(screen.getByTestId('info-validation-error')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Mensagem'), 'a');

    expect(screen.queryByTestId('info-validation-error')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).not.toHaveAttribute('aria-invalid');
  });

  it('submits the trimmed message and calls onSubmitted on success', async () => {
    submitInfoMock.mockResolvedValue(undefined);
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSubmitted={onSubmitted} />);

    await user.type(screen.getByLabelText('Mensagem'), '  Tem película sim  ');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(submitInfoMock).toHaveBeenCalledWith('b1', 'Tem película sim', []);
  });

  it('shows the failure in the pane, keeps the typed text and offers a retry', async () => {
    submitInfoMock.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<Harness onSubmitted={vi.fn()} />);

    const textarea = screen.getByLabelText('Mensagem');
    await user.type(textarea, 'Minha resposta');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    const failure = await screen.findByTestId('info-submit-error');
    expect(failure).toHaveTextContent(
      'Não foi possível enviar sua resposta. Verifique sua conexão e tente novamente.',
    );
    expect(failure).toHaveAttribute('role', 'alert');
    expect(textarea).toHaveValue('Minha resposta');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeEnabled();
  });
});
