// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { IntakeQuestionsCard } from './IntakeQuestionsCard';
import type { IntakeQuestionDraft } from './IntakeQuestionCard';

const QUESTIONS: IntakeQuestionDraft[] = [
  {
    key: 'q-1',
    fieldKey: 'accessNeeds',
    label: 'Necessidades de acesso',
    type: 'FREE_TEXT',
    required: false,
  },
];

describe('IntakeQuestionsCard', () => {
  it('shows the empty hint when there are no questions', () => {
    renderWithIntl(
      <IntakeQuestionsCard
        questions={[]}
        resolveFieldKey={(q) => q.fieldKey}
        hasDuplicateFieldKeys={false}
        canAddQuestion
        onAdd={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
      />,
    );

    expect(screen.getByTestId('intake-questions-empty')).toBeInTheDocument();
  });

  it('renders one IntakeQuestionCard per question', () => {
    renderWithIntl(
      <IntakeQuestionsCard
        questions={QUESTIONS}
        resolveFieldKey={(q) => q.fieldKey}
        hasDuplicateFieldKeys={false}
        canAddQuestion
        onAdd={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Necessidades de acesso')).toBeInTheDocument();
  });

  it('shows the duplicate-fieldKey warning when hasDuplicateFieldKeys is true', () => {
    renderWithIntl(
      <IntakeQuestionsCard
        questions={QUESTIONS}
        resolveFieldKey={(q) => q.fieldKey}
        hasDuplicateFieldKeys
        canAddQuestion
        onAdd={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
      />,
    );

    expect(screen.getByTestId('intake-duplicate-fieldkey-error')).toBeInTheDocument();
  });

  it('disables the add-question button when canAddQuestion is false', () => {
    renderWithIntl(
      <IntakeQuestionsCard
        questions={QUESTIONS}
        resolveFieldKey={(q) => q.fieldKey}
        hasDuplicateFieldKeys={false}
        canAddQuestion={false}
        onAdd={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
      />,
    );

    expect(screen.getByTestId('intake-add-question')).toBeDisabled();
  });

  it('calls onAdd when the add-question button is clicked', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderWithIntl(
      <IntakeQuestionsCard
        questions={[]}
        resolveFieldKey={(q) => q.fieldKey}
        hasDuplicateFieldKeys={false}
        canAddQuestion
        onAdd={onAdd}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('intake-add-question'));
    expect(onAdd).toHaveBeenCalled();
  });
});
