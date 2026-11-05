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
        hasBlankLabel={false}
        hasEmptyFieldKey={false}
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
        hasBlankLabel={false}
        hasEmptyFieldKey={false}
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
        hasBlankLabel={false}
        hasEmptyFieldKey={false}
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

  it('shows the blank-label warning when hasBlankLabel is true', () => {
    renderWithIntl(
      <IntakeQuestionsCard
        questions={QUESTIONS}
        resolveFieldKey={(q) => q.fieldKey}
        hasDuplicateFieldKeys={false}
        hasBlankLabel
        hasEmptyFieldKey={false}
        canAddQuestion
        onAdd={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
      />,
    );

    expect(screen.getByTestId('intake-blank-label-error')).toBeInTheDocument();
  });

  it('disables the add-question button when canAddQuestion is false', () => {
    renderWithIntl(
      <IntakeQuestionsCard
        questions={QUESTIONS}
        resolveFieldKey={(q) => q.fieldKey}
        hasDuplicateFieldKeys={false}
        hasBlankLabel={false}
        hasEmptyFieldKey={false}
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
        hasBlankLabel={false}
        hasEmptyFieldKey={false}
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

  it('shows the empty-key error when a label cannot produce an internal key', () => {
    renderWithIntl(
      <IntakeQuestionsCard
        questions={[]}
        resolveFieldKey={(q) => q.fieldKey}
        hasDuplicateFieldKeys={false}
        hasBlankLabel={false}
        hasEmptyFieldKey
        canAddQuestion
        onAdd={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
      />,
    );

    expect(screen.getByTestId('intake-empty-key-error')).toBeInTheDocument();
  });

  it('renders the intro under the title when one is passed', () => {
    renderWithIntl(
      <IntakeQuestionsCard
        questions={QUESTIONS}
        resolveFieldKey={(q) => q.fieldKey}
        hasDuplicateFieldKeys={false}
        hasBlankLabel={false}
        hasEmptyFieldKey={false}
        canAddQuestion
        onAdd={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
        intro="Perguntas que o cliente responde."
      />,
    );

    expect(screen.getByText('Perguntas que o cliente responde.')).toBeInTheDocument();
  });

  it('renders only the existing hint under the title when no intro is passed', () => {
    const { container } = renderWithIntl(
      <IntakeQuestionsCard
        questions={QUESTIONS}
        resolveFieldKey={(q) => q.fieldKey}
        hasDuplicateFieldKeys={false}
        hasBlankLabel={false}
        hasEmptyFieldKey={false}
        canAddQuestion
        onAdd={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('h2 + p')).toHaveLength(1);
    expect(container.querySelector('h2 + p')).toHaveClass('text-xs');
  });

  describe('validation messages (TD57-S17)', () => {
    const BLANK: IntakeQuestionDraft = {
      key: 'q-blank',
      fieldKey: '',
      label: '  ',
      type: 'FREE_TEXT',
      required: false,
    };
    const SYMBOLS: IntakeQuestionDraft = {
      key: 'q-sym',
      fieldKey: '',
      label: '!!!',
      type: 'FREE_TEXT',
      required: false,
    };

    function renderCard(
      questions: IntakeQuestionDraft[],
      flags: { dup?: boolean; blank?: boolean; empty?: boolean },
    ): void {
      renderWithIntl(
        <IntakeQuestionsCard
          questions={questions}
          resolveFieldKey={(q) => q.fieldKey}
          hasDuplicateFieldKeys={flags.dup ?? false}
          hasBlankLabel={flags.blank ?? false}
          hasEmptyFieldKey={flags.empty ?? false}
          canAddQuestion
          onAdd={vi.fn()}
          onMove={vi.fn()}
          onRemove={vi.fn()}
          onChangeLabel={vi.fn()}
          onChangeType={vi.fn()}
          onChangeRequired={vi.fn()}
        />,
      );
    }

    it('links a blank row to the blank-label and duplicate messages, and leaves a valid row alone', () => {
      renderCard([BLANK, { ...BLANK, key: 'q-blank-2' }, ...QUESTIONS], {
        dup: true,
        blank: true,
      });

      const labels = screen.getAllByTestId('intake-question-label');
      expect(labels[0]).toHaveAttribute('aria-invalid', 'true');
      expect(labels[0]).toHaveAttribute(
        'aria-describedby',
        'intake-blank-label-error intake-duplicate-fieldkey-error',
      );
      expect(labels[2]).not.toHaveAttribute('aria-invalid');
      expect(labels[2]).not.toHaveAttribute('aria-describedby');
    });

    it('links a non-blank label that derives no key to the empty-key message', () => {
      renderCard([SYMBOLS, ...QUESTIONS], { empty: true });

      expect(screen.getAllByTestId('intake-question-label')[0]).toHaveAttribute(
        'aria-describedby',
        'intake-empty-key-error',
      );
      expect(screen.getByTestId('intake-empty-key-error')).toHaveAttribute(
        'id',
        'intake-empty-key-error',
      );
    });

    it('renders every message as a field message with no role', () => {
      renderCard([BLANK, SYMBOLS, { ...BLANK, key: 'q-3' }], {
        dup: true,
        blank: true,
        empty: true,
      });

      for (const testId of [
        'intake-duplicate-fieldkey-error',
        'intake-blank-label-error',
        'intake-empty-key-error',
      ]) {
        expect(screen.getByTestId(testId)).not.toHaveAttribute('role');
      }
    });
  });
});
