// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TimeSelectField } from './TimeSelectField';

describe('TimeSelectField', () => {
  it('renders the label and placeholder', () => {
    render(
      <TimeSelectField
        label="Início"
        value=""
        onValueChange={vi.fn()}
        options={['08:00', '08:30', '09:00']}
        placeholder="Selecione"
        portalContainer={null}
      />,
    );

    expect(screen.getByText('Início')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('Selecione');
  });

  it('renders the selected value in the trigger', () => {
    render(
      <TimeSelectField
        label="Início"
        value="08:30"
        onValueChange={vi.fn()}
        options={['08:00', '08:30', '09:00']}
        placeholder="Selecione"
        portalContainer={null}
      />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('08:30');
  });

  it('opens the option list and calls onValueChange when an option is chosen', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <TimeSelectField
        label="Início"
        value=""
        onValueChange={onValueChange}
        options={['08:00', '08:30', '09:00']}
        placeholder="Selecione"
        portalContainer={null}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    const option = await screen.findByRole('option', { name: '08:30' });
    await user.click(option);

    expect(onValueChange).toHaveBeenCalledWith('08:30');
  });

  it('renders one option per entry in options', async () => {
    const user = userEvent.setup();
    render(
      <TimeSelectField
        label="Início"
        value=""
        onValueChange={vi.fn()}
        options={['08:00', '08:30', '09:00']}
        placeholder="Selecione"
        portalContainer={null}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findAllByRole('option')).toHaveLength(3);
  });
});
