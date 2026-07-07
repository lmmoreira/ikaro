// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';

describe('Command', () => {
  it('filters items as the user types in the search input', async () => {
    const user = userEvent.setup();

    render(
      <Command>
        <CommandInput placeholder="Buscar..." />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandGroup>
            <CommandItem value="Inter">Inter</CommandItem>
            <CommandItem value="Montserrat">Montserrat</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );

    expect(screen.getByText('Inter')).toBeInTheDocument();
    expect(screen.getByText('Montserrat')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Buscar...'), 'mont');

    expect(screen.queryByText('Inter')).not.toBeInTheDocument();
    expect(screen.getByText('Montserrat')).toBeInTheDocument();
  });

  it('shows the empty state when no items match', async () => {
    const user = userEvent.setup();

    render(
      <Command>
        <CommandInput placeholder="Buscar..." />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandGroup>
            <CommandItem value="Inter">Inter</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );

    await user.type(screen.getByPlaceholderText('Buscar...'), 'zzz');

    expect(screen.getByText('Nada encontrado.')).toBeInTheDocument();
  });
});
