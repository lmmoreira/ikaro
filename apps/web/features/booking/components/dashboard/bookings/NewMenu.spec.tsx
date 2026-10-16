// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { NEW_MENU_ITEMS, NewMenu } from './NewMenu';

describe('NewMenu', () => {
  it('is one "+ Novo" button that opens a menu', async () => {
    renderWithIntl(<NewMenu />);

    expect(screen.queryByTestId('new-menu')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('new-menu-trigger'));

    expect(screen.getByTestId('new-menu')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '+ Novo' })).toHaveLength(1);
  });

  it('offers Agendamento and Recorrência, both through the shared customer chooser', async () => {
    renderWithIntl(<NewMenu />);
    await userEvent.click(screen.getByTestId('new-menu-trigger'));

    const items = screen.getAllByTestId('new-menu-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute('data-item', 'agendamento');
    expect(items[0]).toHaveAttribute('href', '/dashboard/bookings/new?tipo=agendamento');
    expect(items[1]).toHaveAttribute('data-item', 'recorrencia');
    expect(items[1]).toHaveAttribute('href', '/dashboard/bookings/new?tipo=recorrencia');
    expect(screen.getByText('Recorrência')).toBeInTheDocument();
    expect(NEW_MENU_ITEMS.map((item) => item.key)).toEqual(['agendamento', 'recorrencia']);
  });

  it('closes after an entry is chosen', async () => {
    renderWithIntl(<NewMenu />);
    await userEvent.click(screen.getByTestId('new-menu-trigger'));

    await userEvent.click(screen.getAllByTestId('new-menu-item')[0]!);

    expect(screen.queryByTestId('new-menu')).not.toBeInTheDocument();
  });
});
