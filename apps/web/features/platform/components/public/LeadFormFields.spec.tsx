// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LeadFormQuestion } from '@ikaro/types';
import { LeadFormFields, type LeadFormFeedback } from './LeadFormFields';

vi.mock('./TurnstileWidget', () => ({
  TurnstileWidget: () => <div data-testid="turnstile-mock" />,
}));

const QUESTIONS: LeadFormQuestion[] = [
  { id: 'q1', label: 'Qual serviço?', type: 'TEXT', required: true, order: 1 },
];

function feedbackStub(overrides: Partial<LeadFormFeedback> = {}): LeadFormFeedback {
  return {
    error: null,
    success: null,
    feedback: null,
    fieldErrors: {},
    fieldProps: () => ({
      ref: vi.fn(),
      'aria-invalid': undefined,
      'aria-describedby': undefined,
    }),
    fieldErrorId: (name: string) => `${name}-error`,
    setError: vi.fn(),
    setFieldErrors: vi.fn(),
    focusFirstInvalid: vi.fn(),
    registerField: vi.fn(),
    clear: vi.fn(),
    edit: vi.fn(),
    setSuccess: vi.fn(),
    setFromApiError: vi.fn(),
    ...overrides,
  };
}

function baseProps() {
  return {
    title: 'Quer um orçamento?',
    questions: QUESTIONS,
    name: '',
    email: '',
    phone: '',
    phonePrefix: '+55',
    onNameChange: vi.fn(),
    onEmailChange: vi.fn(),
    onPhoneChange: vi.fn(),
    showPrefilledNote: false,
    answers: {},
    onAnswerChange: vi.fn(),
    feedback: feedbackStub(),
    isCaptchaError: false,
    isTurnstileVerified: false,
    isSubmitting: false,
    turnstileKey: 0,
    onTurnstileVerify: vi.fn(),
    onTurnstileExpire: vi.fn(),
    onTurnstileError: vi.fn(),
    onTurnstileLoadTimeout: vi.fn(),
    onSubmit: vi.fn(),
  };
}

describe('LeadFormFields', () => {
  it('renders contact fields and questions, submit button labeled "Enviar" by default', () => {
    renderWithIntl(<LeadFormFields {...baseProps()} />);

    expect(screen.getByTestId('lead-form-name')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-question')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-submit')).toHaveTextContent('Enviar');
  });

  it('shows the form message as a branded alert under the submit button', () => {
    renderWithIntl(
      <LeadFormFields
        {...baseProps()}
        feedback={feedbackStub({ error: 'Corrija os campos destacados abaixo antes de enviar.' })}
      />,
    );

    const banner = screen.getByTestId('lead-form-validation-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent('Não foi possível enviar');
    expect(banner).toHaveTextContent('Corrija os campos destacados abaixo antes de enviar.');
    expect(
      screen.getByTestId('lead-form-submit').compareDocumentPosition(banner) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows no form message when the feedback has none', () => {
    renderWithIntl(<LeadFormFields {...baseProps()} />);
    expect(screen.queryByTestId('lead-form-validation-banner')).not.toBeInTheDocument();
  });

  it('shows the captcha message as a branded alert (not an amber banner) and relabels the submit button', () => {
    renderWithIntl(<LeadFormFields {...baseProps()} isCaptchaError />);

    const banner = screen.getByTestId('lead-form-captcha-banner');
    expect(banner).toHaveAttribute('role', 'alert');
    expect(banner).toHaveTextContent('Verificação de segurança expirou');
    expect(banner.className).not.toContain('amber');
    expect(screen.getByTestId('lead-form-submit')).toHaveTextContent('Tentar novamente');
  });

  it('marks and describes an invalid contact field and a question from the feedback', () => {
    renderWithIntl(
      <LeadFormFields
        {...baseProps()}
        feedback={feedbackStub({
          fieldErrors: {
            email: 'Informe um e-mail válido.',
            'question:q1': 'Resposta obrigatória.',
          },
          fieldProps: (name: string) => ({
            ref: vi.fn(),
            'aria-invalid': true as const,
            'aria-describedby': `${name}-error`,
          }),
        })}
      />,
    );

    expect(screen.getByTestId('lead-form-email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('lead-form-email')).toHaveAttribute(
      'aria-describedby',
      'email-error',
    );
    expect(screen.getByTestId('lead-form-email-error')).toHaveTextContent(
      'Informe um e-mail válido.',
    );
    expect(screen.getByTestId('lead-form-question-error')).toHaveTextContent(
      'Resposta obrigatória.',
    );
  });

  it('disables the fieldset and shows "Enviando..." while submitting', () => {
    renderWithIntl(<LeadFormFields {...baseProps()} isSubmitting />);
    expect(screen.getByTestId('lead-form-submit')).toBeDisabled();
    expect(screen.getByTestId('lead-form-submit')).toHaveTextContent('Enviando...');
  });

  it('shows the prefilled note when showPrefilledNote is true', () => {
    renderWithIntl(<LeadFormFields {...baseProps()} showPrefilledNote />);
    expect(screen.getByText(/Preenchido com os dados da sua conta/)).toBeInTheDocument();
  });

  it('shows a pending status until isTurnstileVerified is true, never claiming verification early', () => {
    const { rerender } = renderWithIntl(<LeadFormFields {...baseProps()} />);
    expect(screen.getByText('Verificando segurança...')).toBeInTheDocument();

    rerender(<LeadFormFields {...baseProps()} isTurnstileVerified />);
    expect(screen.getByText('Verificação de segurança concluída')).toBeInTheDocument();
  });

  it('calls onSubmit when the submit button is clicked', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithIntl(<LeadFormFields {...baseProps()} onSubmit={onSubmit} />);

    await user.click(screen.getByTestId('lead-form-submit'));
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
