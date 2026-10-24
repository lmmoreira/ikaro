// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import {
  DEFAULT,
  OpacityField,
  TouchedColorPicker,
  pickOrUndefined,
} from './presentation-field-parts';

describe('pickOrUndefined', () => {
  it('maps the default sentinel to undefined and passes a real value through', () => {
    expect(pickOrUndefined(DEFAULT)).toBeUndefined();
    expect(pickOrUndefined('narrow')).toBe('narrow');
  });
});

describe('OpacityField', () => {
  function renderField(value = 0.4) {
    const onChange = vi.fn();
    renderWithIntl(
      <OpacityField id="op" label="Opacidade (%)" value={value} onChange={onChange} />,
    );
    return onChange;
  }

  it('shows 0–1 as a whole percentage', () => {
    renderField(0.4);

    expect(screen.getByLabelText('Opacidade (%)')).toHaveValue(40);
  });

  it('stores a typed percentage as 0–1', () => {
    const onChange = renderField();

    fireEvent.change(screen.getByLabelText('Opacidade (%)'), { target: { value: '65' } });

    expect(onChange).toHaveBeenLastCalledWith(0.65);
  });

  // Negative guarantee: the schema rejects an opacity outside 0–1.
  it('clamps out-of-range input', () => {
    const onChange = renderField();
    const input = screen.getByLabelText('Opacidade (%)');

    fireEvent.change(input, { target: { value: '250' } });
    expect(onChange).toHaveBeenLastCalledWith(1);
    fireEvent.change(input, { target: { value: '-5' } });
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it('ignores an empty field instead of writing a value', () => {
    const onChange = renderField();

    fireEvent.change(screen.getByLabelText('Opacidade (%)'), { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('TouchedColorPicker', () => {
  it('reports typed colours', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <TouchedColorPicker
        id="c"
        label="Cor"
        value="#000000"
        errorMessage="inválida"
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId('c'), { target: { value: '#112233' } });

    expect(onChange).toHaveBeenLastCalledWith('#112233');
  });

  // Half a hex must not flash an error mid-keystroke; it shows only once the field was left.
  it('flags a malformed colour only after the field is left', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <TouchedColorPicker
        id="c"
        label="Cor"
        value="#12"
        errorMessage="inválida"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('c-error')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('c'));
    await user.tab();

    expect(screen.getByTestId('c-error')).toHaveTextContent('inválida');
  });

  it('never flags a valid colour', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <TouchedColorPicker
        id="c"
        label="Cor"
        value="#abcdef"
        errorMessage="inválida"
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('c'));
    await user.tab();

    expect(screen.queryByTestId('c-error')).not.toBeInTheDocument();
  });
});
