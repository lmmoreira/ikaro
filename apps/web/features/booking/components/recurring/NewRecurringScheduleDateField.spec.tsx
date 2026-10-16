// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { NewRecurringScheduleDateField } from './NewRecurringScheduleDateField';

function renderField(props: Partial<React.ComponentProps<typeof NewRecurringScheduleDateField>>) {
  const onChange = vi.fn();
  renderWithIntl(
    <NewRecurringScheduleDateField
      testId="f"
      errorTestId="f-error"
      label="Termina em"
      value=""
      min="2026-10-12"
      max="2026-11-11"
      error={null}
      onChange={onChange}
      {...props}
    />,
  );
  return onChange;
}

describe('NewRecurringScheduleDateField', () => {
  it('shows a placeholder until a day is chosen, then the day in the tenant format', () => {
    renderField({});
    expect(screen.getByTestId('f')).toHaveTextContent('Escolher data');
  });

  it('shows the chosen day', () => {
    renderField({ value: '2026-10-20' });
    expect(screen.getByTestId('f')).toHaveTextContent('20/10/2026');
  });

  it('reports the day that is clicked and closes the calendar', () => {
    const onChange = renderField({ value: '2026-10-20' });

    fireEvent.click(screen.getByTestId('f'));
    const calendar = screen.getByRole('grid');
    fireEvent.click(within(calendar).getByRole('button', { name: /22/ }));

    expect(onChange).toHaveBeenCalledWith('2026-10-22');
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('does not offer a day before the minimum or after the maximum', () => {
    renderField({ value: '2026-10-20' });

    fireEvent.click(screen.getByTestId('f'));
    const calendar = screen.getByRole('grid');

    expect(within(calendar).getByRole('button', { name: /11/ })).toBeDisabled();
    expect(within(calendar).getByRole('button', { name: /12/ })).toBeEnabled();
    expect(within(calendar).getByRole('button', { name: /31/ })).toBeEnabled();
  });

  it('shows its error, linked to the control', () => {
    renderField({ error: 'Escolha a data em que a recorrência termina.' });

    expect(screen.getByTestId('f-error')).toHaveTextContent('Escolha a data');
    expect(screen.getByTestId('f')).toHaveAttribute('aria-invalid', 'true');
  });
});
