// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { LeadFormSortableQuestion } from './LeadFormSortableQuestion';

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
});
