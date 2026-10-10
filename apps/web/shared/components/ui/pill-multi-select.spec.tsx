// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PillMultiSelect } from './pill-multi-select';

const OPTIONS = [
  { value: 'mon', label: 'Seg' },
  { value: 'tue', label: 'Ter' },
  { value: 'wed', label: 'Qua' },
] as const;

function renderGroup(values: ('mon' | 'tue' | 'wed')[], onChange = vi.fn()) {
  render(
    <PillMultiSelect
      label="Dias"
      values={values}
      options={OPTIONS}
      onChange={onChange}
      testId="p"
    />,
  );
  return onChange;
}

describe('PillMultiSelect', () => {
  it('marks the chosen pills as pressed', () => {
    renderGroup(['tue']);
    const pills = screen.getAllByTestId('p');
    expect(pills.map((p) => p.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  it('adds a pill and reports the values in the options order', () => {
    const onChange = renderGroup(['wed']);
    fireEvent.click(screen.getAllByTestId('p')[0]!);
    expect(onChange).toHaveBeenCalledWith(['mon', 'wed']);
  });

  it('removes a pill that was already chosen', () => {
    const onChange = renderGroup(['mon', 'tue']);
    fireEvent.click(screen.getAllByTestId('p')[0]!);
    expect(onChange).toHaveBeenCalledWith(['tue']);
  });

  it('names the group and flags it invalid when asked', () => {
    render(
      <PillMultiSelect label="Dias" values={[]} options={OPTIONS} onChange={vi.fn()} invalid />,
    );
    const group = screen.getByRole('group', { name: 'Dias' });
    expect(group).toHaveAttribute('data-invalid', 'true');
  });
});
