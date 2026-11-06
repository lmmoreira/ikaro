// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { NativeSelect } from './native-select';

function Options(): React.JSX.Element {
  return (
    <>
      <option value="">None</option>
      <option value="a">A</option>
      <option value="b">B</option>
    </>
  );
}

describe('NativeSelect', () => {
  it('stays a native select driven by selectOptions, including the empty value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <NativeSelect aria-label="Pick" defaultValue="a" onChange={onChange}>
        <Options />
      </NativeSelect>,
    );

    const select = screen.getByRole('combobox', { name: 'Pick' });
    expect(select).toBeInstanceOf(HTMLSelectElement);

    await user.selectOptions(select, 'b');
    expect(select).toHaveValue('b');

    await user.selectOptions(select, '');
    expect(select).toHaveValue('');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('forwards a ref to the underlying select', () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <NativeSelect ref={ref} aria-label="Pick">
        <Options />
      </NativeSelect>,
    );

    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });

  it('puts className on the select and wrapperClassName on the wrapper', () => {
    render(
      <NativeSelect aria-label="Pick" className="font-mono" wrapperClassName="w-32">
        <Options />
      </NativeSelect>,
    );

    const select = screen.getByRole('combobox');
    expect(select).toHaveClass('font-mono');
    expect(select.parentElement).toHaveClass('w-32');
    expect(select.parentElement).not.toHaveClass('w-full');
  });

  it('respects disabled and styles aria-invalid', () => {
    render(
      <NativeSelect aria-label="Pick" disabled aria-invalid>
        <Options />
      </NativeSelect>,
    );

    const select = screen.getByRole('combobox');
    expect(select).toBeDisabled();
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveClass('aria-[invalid=true]:border-red-500');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <NativeSelect aria-label="Pick">
        <Options />
      </NativeSelect>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
