// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { IntakeQuestionCard, type IntakeQuestionDraft } from './IntakeQuestionCard';

const QUESTION: IntakeQuestionDraft = {
  key: 'q-1',
  fieldKey: 'accessNeeds',
  label: 'Necessidades de acesso',
  type: 'FREE_TEXT',
  required: false,
};

describe('IntakeQuestionCard', () => {
  it('renders the question fields and the resolved fieldKey hint', () => {
    renderWithIntl(
      <IntakeQuestionCard
        question={QUESTION}
        index={0}
        isFirst
        isLast={false}
        resolvedFieldKey="accessNeeds"
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Necessidades de acesso')).toBeInTheDocument();
    expect(screen.getByText(/accessNeeds/)).toBeInTheDocument();
  });

  it('disables move-up on the first question and move-down on the last', () => {
    renderWithIntl(
      <IntakeQuestionCard
        question={QUESTION}
        index={0}
        isFirst
        isLast
        resolvedFieldKey="accessNeeds"
        onMove={vi.fn()}
        onRemove={vi.fn()}
        onChangeLabel={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRequired={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Mover pergunta para cima')).toBeDisabled();
    expect(screen.getByLabelText('Mover pergunta para baixo')).toBeDisabled();
  });

  it('calls onMove/onRemove/onChangeLabel/onChangeType/onChangeRequired', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    const onRemove = vi.fn();
    const onChangeLabel = vi.fn();
    const onChangeType = vi.fn();
    const onChangeRequired = vi.fn();
    renderWithIntl(
      <IntakeQuestionCard
        question={QUESTION}
        index={0}
        isFirst={false}
        isLast={false}
        resolvedFieldKey="accessNeeds"
        onMove={onMove}
        onRemove={onRemove}
        onChangeLabel={onChangeLabel}
        onChangeType={onChangeType}
        onChangeRequired={onChangeRequired}
      />,
    );

    await user.click(screen.getByLabelText('Mover pergunta para cima'));
    expect(onMove).toHaveBeenCalledWith(-1);

    await user.click(screen.getByLabelText('Remover pergunta'));
    expect(onRemove).toHaveBeenCalled();

    await user.type(screen.getByDisplayValue('Necessidades de acesso'), 'X');
    expect(onChangeLabel).toHaveBeenCalled();

    await user.selectOptions(screen.getByTestId('intake-question-type'), 'NAMED_ATTENDEES');
    expect(onChangeType).toHaveBeenCalledWith('NAMED_ATTENDEES');

    await user.click(screen.getByTestId('intake-question-required'));
    expect(onChangeRequired).toHaveBeenCalledWith(true);
  });
});
