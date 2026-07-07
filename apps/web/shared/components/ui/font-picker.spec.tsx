// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { FontPicker } from './font-picker';

const OPTIONS = [
  { name: 'Inter', cssValue: 'var(--font-inter)' },
  { name: 'Montserrat', cssValue: 'var(--font-montserrat)' },
];

describe('FontPicker', () => {
  it('renders the label and current selection', () => {
    renderWithIntl(
      <FontPicker
        id="heading-font"
        label="Fonte de títulos"
        value="Inter"
        options={OPTIONS}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Fonte de títulos')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('Inter');
  });

  it('calls onChange with the selected font name', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <FontPicker
        id="heading-font"
        label="Fonte de títulos"
        value="Inter"
        options={OPTIONS}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Montserrat' }));

    expect(onChange).toHaveBeenCalledWith('Montserrat');
  });
});
