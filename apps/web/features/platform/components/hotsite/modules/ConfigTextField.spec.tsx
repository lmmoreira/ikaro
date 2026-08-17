// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfigTextField } from './ConfigTextField';

describe('ConfigTextField', () => {
  it('associates the label with the input via htmlFor/id', () => {
    render(<ConfigTextField id="botName" label="Nome do bot" value="" onChange={vi.fn()} />);

    expect(screen.getByLabelText('Nome do bot')).toBeInTheDocument();
  });

  it('renders the current value and placeholder', () => {
    render(
      <ConfigTextField
        id="botName"
        label="Nome do bot"
        value="Assistente"
        placeholder="Ex: Assistente"
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByLabelText('Nome do bot');
    expect(input).toHaveValue('Assistente');
    expect(input).toHaveAttribute('placeholder', 'Ex: Assistente');
  });

  it('calls onChange with the new value as the user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ConfigTextField id="botName" label="Nome do bot" value="" onChange={onChange} />);

    await user.type(screen.getByLabelText('Nome do bot'), 'X');

    expect(onChange).toHaveBeenCalledWith('X');
  });
});
