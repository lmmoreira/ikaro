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

// Every question/option shares the same static data-testid (E2E-3) — the question/option
// identity lives in separate data-question-id/data-option-value attributes instead, so a spec
// selects a specific one via querySelector rather than getByTestId.
function getOption(container: HTMLElement, questionId: string, option: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    `[data-testid="lead-form-question-option"][data-question-id="${questionId}"][data-option-value="${option}"]`,
  );
  if (!el) throw new Error(`option not found: ${questionId}/${option}`);
  return el;
}

describe('LeadFormQuestionField', () => {
  it('renders a TEXT question as a textarea and reports changes, marked optional', () => {
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <LeadFormQuestionField question={TEXT_QUESTION} value={undefined} onChange={onChange} />,
    );

    expect(screen.getByText('(opcional)')).toBeInTheDocument();
    const textarea = container.querySelector(
      '[data-testid="lead-form-question"][data-question-id="q1"]',
    );
    expect(textarea).toBeInTheDocument();
  });

  it('renders a SINGLE_CHOICE question as a radio group and selects one option at a time', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <LeadFormQuestionField
        question={SINGLE_CHOICE_QUESTION}
        value="Lavagem completa"
        onChange={onChange}
      />,
    );

    expect(getOption(container, 'q2', 'Lavagem completa')).toBeChecked();
    await user.click(getOption(container, 'q2', 'Enceramento'));

    expect(onChange).toHaveBeenCalledWith('Enceramento');
  });

  it('renders a MULTIPLE_CHOICE question as checkboxes and toggles the array value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <LeadFormQuestionField
        question={MULTIPLE_CHOICE_QUESTION}
        value={['Manhã']}
        onChange={onChange}
      />,
    );

    expect(getOption(container, 'q3', 'Manhã')).toBeChecked();
    await user.click(getOption(container, 'q3', 'Tarde'));

    expect(onChange).toHaveBeenCalledWith(['Manhã', 'Tarde']);
  });

  it('shows the error message when provided', () => {
    const { container } = renderWithIntl(
      <LeadFormQuestionField
        question={SINGLE_CHOICE_QUESTION}
        value={undefined}
        error="Selecione uma opção."
        onChange={vi.fn()}
      />,
    );

    const error = container.querySelector(
      '[data-testid="lead-form-question-error"][data-question-id="q2"]',
    );
    expect(error).toHaveTextContent('Selecione uma opção.');
  });

  it('groups a SINGLE_CHOICE question in a fieldset/legend, not a bare labelled span', () => {
    const { container } = renderWithIntl(
      <LeadFormQuestionField
        question={SINGLE_CHOICE_QUESTION}
        value={undefined}
        onChange={vi.fn()}
      />,
    );

    const group = screen.getByRole('group');
    expect(group.tagName).toBe('FIELDSET');
    expect(container.querySelector('legend')).toHaveTextContent(SINGLE_CHOICE_QUESTION.label);
  });

  it("associates the group's error with the fieldset via aria-describedby", () => {
    renderWithIntl(
      <LeadFormQuestionField
        question={SINGLE_CHOICE_QUESTION}
        value={undefined}
        error="Selecione uma opção."
        onChange={vi.fn()}
      />,
    );

    const group = screen.getByRole('group');
    const errorId = group.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent('Selecione uma opção.');
  });
});
