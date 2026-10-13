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

  it('offers only Agendamento until the recurrence story ships its own entry', async () => {
    renderWithIntl(<NewMenu />);
    await userEvent.click(screen.getByTestId('new-menu-trigger'));

    const items = screen.getAllByTestId('new-menu-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveAttribute('data-item', 'agendamento');
    expect(items[0]).toHaveAttribute('href', '/dashboard/bookings/new?tipo=agendamento');
    expect(screen.queryByText('Recorrência')).not.toBeInTheDocument();
    expect(NEW_MENU_ITEMS.map((item) => item.key)).toEqual(['agendamento']);
  });

  it('closes after an entry is chosen', async () => {
    renderWithIntl(<NewMenu />);
    await userEvent.click(screen.getByTestId('new-menu-trigger'));

    await userEvent.click(screen.getByTestId('new-menu-item'));

    expect(screen.queryByTestId('new-menu')).not.toBeInTheDocument();
  });
});
