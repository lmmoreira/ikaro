// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { LeadFormQuestion } from '@ikaro/types';
import { LeadFormQuestionField } from './LeadFormQuestionField';

const TEXT_QUESTION: LeadFormQuestion = {
  id: 'q1',
  label: 'Algo mais que devemos saber?',
  type: 'TEXT',
  required: false,
  order: 1,
};

const SINGLE_CHOICE_QUESTION: LeadFormQuestion = {
  id: 'q2',
  label: 'Qual serviço te interessa?',
  type: 'SINGLE_CHOICE',
  required: true,
  options: ['Lavagem completa', 'Enceramento'],
  order: 2,
};

const MULTIPLE_CHOICE_QUESTION: LeadFormQuestion = {
  id: 'q3',
  label: 'Melhores dias para contato',
  type: 'MULTIPLE_CHOICE',
  required: false,
  options: ['Manhã', 'Tarde', 'Fim de semana'],
  order: 3,
};

describe('LeadFormQuestionField', () => {
  it('renders a TEXT question as a textarea and reports changes, marked optional', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <LeadFormQuestionField question={TEXT_QUESTION} value={undefined} onChange={onChange} />,
    );

    expect(screen.getByText('(opcional)')).toBeInTheDocument();
    const textarea = screen.getByTestId('lead-form-question-q1');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(textarea).toBeInTheDocument();
  });

  it('renders a SINGLE_CHOICE question as a radio group and selects one option at a time', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <LeadFormQuestionField
        question={SINGLE_CHOICE_QUESTION}
        value="Lavagem completa"
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId('lead-form-question-q2-Lavagem completa')).toBeChecked();
    await user.click(screen.getByTestId('lead-form-question-q2-Enceramento'));

    expect(onChange).toHaveBeenCalledWith('Enceramento');
  });

  it('renders a MULTIPLE_CHOICE question as checkboxes and toggles the array value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <LeadFormQuestionField
        question={MULTIPLE_CHOICE_QUESTION}
        value={['Manhã']}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId('lead-form-question-q3-Manhã')).toBeChecked();
    await user.click(screen.getByTestId('lead-form-question-q3-Tarde'));

    expect(onChange).toHaveBeenCalledWith(['Manhã', 'Tarde']);
  });

  it('shows the error message when provided', () => {
    renderWithIntl(
      <LeadFormQuestionField
        question={SINGLE_CHOICE_QUESTION}
        value={undefined}
        error="Selecione uma opção."
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('lead-form-question-q2-error')).toHaveTextContent(
      'Selecione uma opção.',
    );
  });
});
