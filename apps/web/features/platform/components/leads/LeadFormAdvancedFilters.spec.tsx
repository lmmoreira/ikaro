// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { createEmptyFilterRow } from '@/features/platform/model/lead-form-search';
import { LeadFormAdvancedFilters } from './LeadFormAdvancedFilters';

const LABELS = {
  questionPlaceholder: 'Selecione uma pergunta...',
  valuePlaceholder: 'Contém...',
  removeRowLabel: 'Remover filtro',
  addRowLabel: '+ Adicionar filtro',
  andLabel: 'E',
};

describe('LeadFormAdvancedFilters', () => {
  it('renders one row per entry', () => {
    const rows = [createEmptyFilterRow(), createEmptyFilterRow()];
    renderWithIntl(
      <LeadFormAdvancedFilters
        rows={rows}
        filterOptionLabels={[]}
        onChange={vi.fn()}
        {...LABELS}
      />,
    );

    expect(screen.getAllByTestId('leads-filter-row')).toHaveLength(2);
  });

  it('shows the "E" (AND) label between rows but not before the first', () => {
    const rows = [createEmptyFilterRow(), createEmptyFilterRow()];
    renderWithIntl(
      <LeadFormAdvancedFilters
        rows={rows}
        filterOptionLabels={[]}
        onChange={vi.fn()}
        {...LABELS}
      />,
    );

    expect(screen.getAllByText('E')).toHaveLength(1);
  });

  it('calls onChange with the updated value when typing into a row', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const row = createEmptyFilterRow();
    renderWithIntl(
      <LeadFormAdvancedFilters
        rows={[row]}
        filterOptionLabels={[]}
        onChange={handleChange}
        {...LABELS}
      />,
    );

    await user.type(screen.getByTestId('leads-filter-row-value'), 'c');

    expect(handleChange).toHaveBeenCalledWith([{ ...row, value: 'c' }]);
  });

  it('adds a new empty row when "+ Adicionar filtro" is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const row = createEmptyFilterRow();
    renderWithIntl(
      <LeadFormAdvancedFilters
        rows={[row]}
        filterOptionLabels={[]}
        onChange={handleChange}
        {...LABELS}
      />,
    );

    await user.click(screen.getByTestId('leads-filter-add-row'));

    expect(handleChange).toHaveBeenCalledTimes(1);
    const nextRows = handleChange.mock.calls[0][0];
    expect(nextRows).toHaveLength(2);
    expect(nextRows[0]).toEqual(row);
  });

  it('hides "+ Adicionar filtro" once at the 5-row cap', () => {
    const rows = Array.from({ length: 5 }, () => createEmptyFilterRow());
    renderWithIntl(
      <LeadFormAdvancedFilters
        rows={rows}
        filterOptionLabels={[]}
        onChange={vi.fn()}
        {...LABELS}
      />,
    );

    expect(screen.queryByTestId('leads-filter-add-row')).not.toBeInTheDocument();
  });

  it('removes a row when its remove button is clicked', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const rowA = createEmptyFilterRow();
    const rowB = createEmptyFilterRow();
    renderWithIntl(
      <LeadFormAdvancedFilters
        rows={[rowA, rowB]}
        filterOptionLabels={[]}
        onChange={handleChange}
        {...LABELS}
      />,
    );

    await user.click(screen.getAllByTestId('leads-filter-row-remove')[0]);

    expect(handleChange).toHaveBeenCalledWith([rowB]);
  });
});
