// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import {
  ListShell,
  RemoveButton,
  TextInput,
  replaceAt,
  useItemKeys,
} from './ContentBlockFieldParts';

describe('TextInput', () => {
  it('is labelled, bounded, and reports what is typed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<TextInput id="t" label="Título" value="A" maxLength={5} onChange={onChange} />);

    const field = screen.getByLabelText('Título');
    expect(field).toHaveAttribute('maxlength', '5');
    await user.type(field, 'b');

    expect(onChange).toHaveBeenLastCalledWith('Ab');
  });
});

describe('ListShell', () => {
  function renderShell(count: number, onAdd = vi.fn()) {
    renderWithIntl(
      <ListShell
        title="Pontos"
        testId="shell"
        count={count}
        min={2}
        max={4}
        addLabel="Adicionar ponto"
        onAdd={onAdd}
      >
        <p>itens</p>
      </ListShell>,
    );
    return onAdd;
  }

  it('shows its title, the allowed bounds and its items', () => {
    renderShell(2);

    expect(screen.getByTestId('shell')).toBeInTheDocument();
    expect(screen.getByText('Pontos')).toBeInTheDocument();
    expect(screen.getByText('Entre 2 e 4 itens.')).toBeInTheDocument();
    expect(screen.getByText('itens')).toBeInTheDocument();
  });

  it('adds while below the maximum', async () => {
    const user = userEvent.setup();
    const onAdd = renderShell(3);

    await user.click(screen.getByRole('button', { name: 'Adicionar ponto' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  // Negative guarantee: the schema allows at most `max` items.
  it('cannot add at the maximum', () => {
    renderShell(4);

    expect(screen.getByRole('button', { name: 'Adicionar ponto' })).toBeDisabled();
  });
});

describe('RemoveButton', () => {
  it('removes when enabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithIntl(<RemoveButton disabled={false} label="Remover o item 1" onClick={onClick} />);

    await user.click(screen.getByRole('button', { name: 'Remover o item 1' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled at the minimum', () => {
    renderWithIntl(<RemoveButton disabled label="Remover o item 1" onClick={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Remover o item 1' })).toBeDisabled();
  });
});

describe('replaceAt', () => {
  it('replaces one position and leaves the original untouched', () => {
    const items = ['a', 'b', 'c'];

    expect(replaceAt(items, 1, 'x')).toEqual(['a', 'x', 'c']);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('useItemKeys', () => {
  it('gives each item its own key', () => {
    const { result } = renderHook(() => useItemKeys(3));

    expect(new Set(result.current.keys).size).toBe(3);
  });

  it('adds a fresh key without touching the others', () => {
    const { result, rerender } = renderHook(({ length }) => useItemKeys(length), {
      initialProps: { length: 2 },
    });
    const before = [...result.current.keys];

    act(() => result.current.add());
    rerender({ length: 3 });

    expect(result.current.keys.slice(0, 2)).toEqual(before);
    expect(new Set(result.current.keys).size).toBe(3);
  });

  // The point of stable keys: removing the middle row keeps the rows around it as they were.
  it('removes the key at an index and keeps the rest in order', () => {
    const { result, rerender } = renderHook(({ length }) => useItemKeys(length), {
      initialProps: { length: 3 },
    });
    const [first, , third] = result.current.keys;

    act(() => result.current.remove(1));
    rerender({ length: 2 });

    expect(result.current.keys).toEqual([first, third]);
  });

  it('still returns one unique key per item if the length changes from outside', () => {
    const { result, rerender } = renderHook(({ length }) => useItemKeys(length), {
      initialProps: { length: 2 },
    });
    const [first] = result.current.keys;

    rerender({ length: 4 });

    expect(result.current.keys).toHaveLength(4);
    expect(result.current.keys[0]).toBe(first);
    expect(new Set(result.current.keys).size).toBe(4);
  });
});
