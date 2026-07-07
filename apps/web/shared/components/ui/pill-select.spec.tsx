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
});
