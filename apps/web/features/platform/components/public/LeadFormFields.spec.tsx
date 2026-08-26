// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LeadFormQuestion } from '@ikaro/types';
import { LeadFormFields } from './LeadFormFields';

vi.mock('./TurnstileWidget', () => ({
  TurnstileWidget: () => <div data-testid="turnstile-mock" />,
}));

const QUESTIONS: LeadFormQuestion[] = [
  { id: 'q1', label: 'Qual serviço?', type: 'TEXT', required: true, order: 1 },
];

function baseProps() {
  return {
    title: 'Quer um orçamento?',
    questions: QUESTIONS,
    name: '',
    email: '',
    phone: '',
    onNameChange: vi.fn(),
    onEmailChange: vi.fn(),
    onPhoneChange: vi.fn(),
    showPrefilledNote: false,
    answers: {},
    onAnswerChange: vi.fn(),
    fieldErrors: { questions: {} },
    showValidationBanner: false,
    isCaptchaError: false,
    isTurnstileVerified: false,
    isSubmitting: false,
    turnstileKey: 0,
    onTurnstileVerify: vi.fn(),
    onTurnstileExpire: vi.fn(),
    onTurnstileError: vi.fn(),
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

  it('shows the validation banner when showValidationBanner is true', () => {
    renderWithIntl(<LeadFormFields {...baseProps()} showValidationBanner />);
    expect(screen.getByTestId('lead-form-validation-banner')).toBeInTheDocument();
  });

  it('shows the captcha banner and relabels the submit button when isCaptchaError is true', () => {
    renderWithIntl(<LeadFormFields {...baseProps()} isCaptchaError />);
    expect(screen.getByTestId('lead-form-captcha-banner')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-submit')).toHaveTextContent('Tentar novamente');
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
