// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PillSelect } from './pill-select';

const OPTIONS = [
  { value: 'sharp', label: 'Retos' },
  { value: 'rounded', label: 'Arredondados' },
  { value: 'pill', label: 'Bem arredondados' },
] as const;

describe('PillSelect', () => {
  it('renders the label and all options, marking the current value selected', () => {
    render(<PillSelect label="Cantos" value="rounded" options={OPTIONS} onChange={vi.fn()} />);

    expect(screen.getByText('Cantos')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Arredondados' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Retos' })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange with the clicked option value', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PillSelect label="Cantos" value="rounded" options={OPTIONS} onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Bem arredondados' }));

    expect(onChange).toHaveBeenCalledWith('pill');
  });

  it('renders a disabled option as a disabled button and does not call onChange when clicked', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const optionsWithDisabled = [
      ...OPTIONS.slice(0, 2),
      { value: 'pill', label: 'Bem arredondados', disabled: true },
    ] as const;
    render(
      <PillSelect
        label="Cantos"
        value="rounded"
        options={optionsWithDisabled}
        onChange={onChange}
      />,
    );

    const disabledOption = screen.getByRole('radio', { name: 'Bem arredondados' });
    expect(disabledOption).toBeDisabled();

    await user.click(disabledOption);

    expect(onChange).not.toHaveBeenCalled();
  });

  // Copilot review, PR #329: a saved value that later becomes disabled (e.g. layout: 'featured'
  // once its image count drops below the minimum) used to render with plain disabled styling,
  // losing the "this is your current pick" signal aria-checked="true" still carries.
  it('renders a selected-but-disabled option with a distinct style from a plain (unselected) disabled option', () => {
    const optionsWithDisabled = [
      ...OPTIONS.slice(0, 2),
      { value: 'pill', label: 'Bem arredondados', disabled: true },
    ] as const;
    const { container } = render(
      <PillSelect label="Cantos" value="pill" options={optionsWithDisabled} onChange={vi.fn()} />,
    );

    const selectedDisabled = screen.getByRole('radio', { name: 'Bem arredondados' });
    expect(selectedDisabled).toBeDisabled();
    expect(selectedDisabled).toHaveAttribute('aria-checked', 'true');
    expect(selectedDisabled).toHaveClass('border-blue-200');
    expect(selectedDisabled).not.toHaveClass('border-gray-100');

    render(
      <PillSelect
        label="Cantos (2)"
        value="rounded"
        options={optionsWithDisabled}
        onChange={vi.fn()}
      />,
      { container: container.appendChild(document.createElement('div')) },
    );
    const unselectedDisabled = screen
      .getByRole('radiogroup', { name: 'Cantos (2)' })
      .querySelector('[aria-checked="false"][disabled]');
    expect(unselectedDisabled).toHaveClass('border-gray-100');
    expect(unselectedDisabled).not.toHaveClass('border-blue-200');
  });

  it('leaves options without an explicit disabled flag enabled, unaffected by a sibling being disabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const optionsWithDisabled = [
      ...OPTIONS.slice(0, 2),
      { value: 'pill', label: 'Bem arredondados', disabled: true },
    ] as const;
    render(
      <PillSelect
        label="Cantos"
        value="rounded"
        options={optionsWithDisabled}
        onChange={onChange}
      />,
    );

    const enabledOption = screen.getByRole('radio', { name: 'Retos' });
    expect(enabledOption).not.toBeDisabled();

    await user.click(enabledOption);

    expect(onChange).toHaveBeenCalledWith('sharp');
  });
});
