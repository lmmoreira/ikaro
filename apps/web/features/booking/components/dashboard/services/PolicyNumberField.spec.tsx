// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NO_FIELD_BINDINGS, renderWithIntl } from '@/test-utils';
import type { PolicyFieldBindings } from './policy-card-helpers';
import { PolicyNumberField } from './PolicyNumberField';

const INVALID: PolicyFieldBindings = {
  fieldErrors: { durationMinMinutes: 'Informe a duração mínima.' },
  fieldErrorId: (name) => `${name}-error`,
  fieldProps: (name) => ({
    ref: () => undefined,
    'aria-invalid': name === 'durationMinMinutes' ? (true as const) : undefined,
    'aria-describedby': name === 'durationMinMinutes' ? `${name}-error` : undefined,
  }),
};

function renderField(fields: PolicyFieldBindings, onChange = vi.fn(), value: number | null = null) {
  renderWithIntl(
    <PolicyNumberField
      name="durationMinMinutes"
      id="policy-duration-min"
      testId="policy-duration-min"
      label="Duração mínima"
      value={value}
      min={1}
      fields={fields}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe('PolicyNumberField', () => {
  it('renders a labelled number input with no message when the field is valid', () => {
    renderField(NO_FIELD_BINDINGS);

    expect(screen.getByLabelText('Duração mínima')).toHaveValue(null);
    expect(screen.getByTestId('policy-duration-min')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Informe a duração mínima.')).not.toBeInTheDocument();
  });

  it('marks the input invalid and shows the message it is described by', () => {
    renderField(INVALID);

    const input = screen.getByTestId('policy-duration-min');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'durationMinMinutes-error');
    expect(input).toHaveClass('border-red-600');
    expect(screen.getByText('Informe a duração mínima.')).toHaveAttribute(
      'id',
      'durationMinMinutes-error',
    );
  });

  it('reports a typed value as a number', async () => {
    const user = userEvent.setup();
    const onChange = renderField(NO_FIELD_BINDINGS);

    await user.type(screen.getByTestId('policy-duration-min'), '4');

    expect(onChange).toHaveBeenLastCalledWith(4);
  });

  it('reports an emptied input as null', async () => {
    const user = userEvent.setup();
    const onChange = renderField(NO_FIELD_BINDINGS, vi.fn(), 30);

    await user.clear(screen.getByTestId('policy-duration-min'));

    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});
