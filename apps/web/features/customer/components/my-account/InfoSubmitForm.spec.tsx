// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InfoSubmitForm } from './InfoSubmitForm';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const translations: Record<string, string> = {
      label: 'Mensagem',
      submit: 'Enviar resposta',
      submitting: 'Enviando...',
      retry: 'Tentar novamente',
      validationError: 'Informe sua resposta antes de enviar.',
      submitError: 'Não foi possível enviar sua resposta. Verifique sua conexão e tente novamente.',
    };
    return translations[key] ?? key;
  },
}));

const submitInfoMock = vi.fn();
vi.mock('../../api', () => ({
  submitInfo: (...args: unknown[]) => submitInfoMock(...args),
}));

describe('InfoSubmitForm', () => {
  beforeEach(() => {
    submitInfoMock.mockReset();
  });

  it('shows the admin request message', () => {
    render(
      <InfoSubmitForm
        bookingId="b1"
        infoRequestMessage="Envie fotos do veículo"
        onSubmitted={vi.fn()}
      />,
    );
    expect(screen.getByText('Envie fotos do veículo')).toBeInTheDocument();
  });

  it('shows a validation error and does not submit when the textarea is empty', async () => {
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(
      <InfoSubmitForm bookingId="b1" infoRequestMessage="Pergunta" onSubmitted={onSubmitted} />,
    );

    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    expect(screen.getByText('Informe sua resposta antes de enviar.')).toBeInTheDocument();
    expect(submitInfoMock).not.toHaveBeenCalled();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it('submits the trimmed message and calls onSubmitted on success', async () => {
    submitInfoMock.mockResolvedValue(undefined);
    const onSubmitted = vi.fn();
    const user = userEvent.setup();
    render(
      <InfoSubmitForm bookingId="b1" infoRequestMessage="Pergunta" onSubmitted={onSubmitted} />,
    );

    await user.type(screen.getByLabelText('Mensagem'), '  Tem película sim  ');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(submitInfoMock).toHaveBeenCalledWith('b1', 'Tem película sim');
  });

  it('shows an inline error and preserves the typed text on failure', async () => {
    submitInfoMock.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    render(<InfoSubmitForm bookingId="b1" infoRequestMessage="Pergunta" onSubmitted={vi.fn()} />);

    const textarea = screen.getByLabelText('Mensagem');
    await user.type(textarea, 'Minha resposta');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() =>
      expect(
        screen.getByText(
          'Não foi possível enviar sua resposta. Verifique sua conexão e tente novamente.',
        ),
      ).toBeInTheDocument(),
    );
    expect(textarea).toHaveValue('Minha resposta');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
