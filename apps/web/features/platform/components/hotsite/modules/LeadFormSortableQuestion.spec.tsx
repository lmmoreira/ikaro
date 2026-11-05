// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '@/test-utils';
import { LeadFormSortableQuestion, type AdminQuestion } from './LeadFormSortableQuestion';

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: () => ({
      attributes: {},
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
    }),
  };
});

describe('LeadFormSortableQuestion', () => {
  it('renders the question editor and submission protection marker', () => {
    renderWithIntl(
      <LeadFormSortableQuestion
        question={{
          id: 'question-1',
          label: 'Qual serviço te interessa?',
          type: 'TEXT',
          required: true,
          order: 0,
          hasSubmissions: true,
        }}
        index={2}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByTestId('lead-form-question')).toHaveAttribute('data-question-index', '2');
    expect(screen.getByDisplayValue('Qual serviço te interessa?')).toBeInTheDocument();
    expect(screen.getByText('Tem respostas')).toBeInTheDocument();
  });

  it('updates label, type, required state, and choice options', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <LeadFormSortableQuestion
        question={{
          id: 'q1',
          label: '',
          type: 'SINGLE_CHOICE',
          required: false,
          order: 0,
          options: ['A', 'B'],
        }}
        index={0}
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText('Pergunta'), 'Escolha');
    await user.click(screen.getByLabelText('Resposta obrigatória'));
    await user.click(screen.getByRole('button', { name: '+ Adicionar opção' }));
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ required: false, options: ['A', 'B', ''] }),
    );
  });

  it('reopens a collapsed card once it becomes invalid, so the error text stays visible', () => {
    // A valid question starts collapsed by default (`open` is only initialized from `invalid`
    // once, at mount) — no manual collapse needed to set up this scenario.
    const validQuestion: AdminQuestion = {
      id: 'q1',
      label: 'Escolha',
      type: 'SINGLE_CHOICE',
      required: false,
      order: 0,
      options: ['A', 'B'],
    };
    const { rerender } = renderWithIntl(
      <LeadFormSortableQuestion
        question={validQuestion}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByTestId('lead-form-question')).not.toHaveAttribute('open');

    // Simulate the question becoming invalid (e.g. an option removed down to 1) while collapsed.
    const invalidQuestion: AdminQuestion = { ...validQuestion, options: ['A'] };
    rerender(
      <LeadFormSortableQuestion
        question={invalidQuestion}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByTestId('lead-form-question')).toHaveAttribute('open');
    expect(screen.getByText('Adicione entre 2 e 10 opções.')).toBeInTheDocument();
  });

  it('links a blank label to its field message and marks the input invalid', () => {
    renderWithIntl(
      <LeadFormSortableQuestion
        question={{ id: 'q1', label: '', type: 'TEXT', required: false, order: 0 }}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const message = screen.getByTestId('lead-form-question-label-error');
    expect(message).not.toHaveAttribute('role');
    const input = screen.getByTestId('lead-form-question-label');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', message.id);
    expect(screen.queryByTestId('lead-form-question-options-error')).not.toBeInTheDocument();
  });

  it('links the option inputs and the add button to the options message', () => {
    renderWithIntl(
      <LeadFormSortableQuestion
        question={{
          id: 'q1',
          label: 'Escolha',
          type: 'SINGLE_CHOICE',
          required: false,
          order: 0,
          options: ['A'],
        }}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    const message = screen.getByTestId('lead-form-question-options-error');
    expect(message).not.toHaveAttribute('role');
    const option = screen.getByTestId('lead-form-question-option-input');
    expect(option).toHaveAttribute('aria-invalid', 'true');
    expect(option).toHaveAttribute('aria-describedby', message.id);
    expect(option.className).toContain('border-red-600');
    expect(screen.queryByTestId('lead-form-question-label-error')).not.toBeInTheDocument();
  });

  it('shows no field message and no link for a valid question', () => {
    renderWithIntl(
      <LeadFormSortableQuestion
        question={{
          id: 'q1',
          label: 'Escolha',
          type: 'SINGLE_CHOICE',
          required: false,
          order: 0,
          options: ['A', 'B'],
        }}
        index={0}
        onChange={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('lead-form-question-label-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lead-form-question-options-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('lead-form-question-label')).not.toHaveAttribute('aria-invalid');
  });
});
