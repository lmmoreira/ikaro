// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { BulkActionBar } from './BulkActionBar';

describe('BulkActionBar', () => {
  it('shows how many entries are selected', () => {
    renderWithIntl(<BulkActionBar count={2} onReassign={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('2 selecionadas')).toBeInTheDocument();
  });

  it('uses the singular for one entry', () => {
    renderWithIntl(<BulkActionBar count={1} onReassign={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('1 selecionada')).toBeInTheDocument();
  });

  it('disables Reatribuir when no selected entry has an alternative', () => {
    renderWithIntl(
      <BulkActionBar count={2} reassignDisabled onReassign={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });

  it('runs Reatribuir and Cancelar', async () => {
    const user = userEvent.setup();
    const onReassign = vi.fn();
    const onCancel = vi.fn();
    renderWithIntl(<BulkActionBar count={2} onReassign={onReassign} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Reatribuir' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onReassign).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('offers only the two bulk actions: no Reagendar (one booking at a time), no Manter, no Dispensar', () => {
    renderWithIntl(<BulkActionBar count={2} onReassign={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Reatribuir',
      'Cancelar',
    ]);
    expect(screen.queryByText(/manter|dispensar/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Reagendar é uma reserva por vez/)).toBeInTheDocument();
  });

  it('sits above the mobile bottom nav and clears the desktop sidebar', () => {
    renderWithIntl(<BulkActionBar count={2} onReassign={vi.fn()} onCancel={vi.fn()} />);

    const bar = screen.getByTestId('scheduling-exceptions-bulk-bar');
    expect(bar.className).toContain('bottom-[calc(3.75rem');
    expect(bar.className).toContain('lg:bottom-0');
    expect(bar.className).toContain('lg:left-60');
  });
});
