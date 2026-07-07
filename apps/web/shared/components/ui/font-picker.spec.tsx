// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { FontPicker } from './font-picker';

const OPTIONS = [
  { name: 'Inter', cssValue: 'var(--font-inter)' },
  { name: 'Montserrat', cssValue: 'var(--font-montserrat)' },
  { name: 'Playfair Display', cssValue: 'var(--font-playfair-display)' },
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

  it('opens the combobox and calls onChange with the selected font name when clicked', async () => {
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

  it('filters options by typing in the search input, preserving the option casing on select', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(
      <FontPicker
        id="heading-font"
        label="Fonte de títulos"
        value="Inter"
        options={OPTIONS}
        onChange={onChange}
        searchPlaceholder="Buscar fonte..."
        emptyLabel="Nenhuma fonte encontrada."
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText('Buscar fonte...'), 'play');

    expect(screen.queryByRole('option', { name: 'Inter' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Playfair Display' }));

    expect(onChange).toHaveBeenCalledWith('Playfair Display');
  });

  it('renders each option in its own font face', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <FontPicker
        id="heading-font"
        label="Fonte de títulos"
        value="Inter"
        options={OPTIONS}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    const montserratOption = screen.getByRole('option', { name: 'Montserrat' });
    expect(montserratOption).toHaveAttribute('data-font-name', 'Montserrat');
    expect(montserratOption.querySelector('span:last-child')).toHaveStyle({
      fontFamily: 'var(--font-montserrat)',
    });
  });
});
