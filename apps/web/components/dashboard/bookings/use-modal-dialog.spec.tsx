// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useModalDialog } from './use-modal-dialog';

function DialogHarness({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const dialogRef = useModalDialog(open, () => {
    onClose();
    setOpen(false);
  });

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <dialog ref={dialogRef} open aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1}>
          <button type="button">First</button>
          <button type="button">Last</button>
        </dialog>
      )}
    </div>
  );
}

describe('useModalDialog', () => {
  it('focuses the first control and loops tab navigation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<DialogHarness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());

    await user.tab();
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('loops backwards when shift-tabbing from the first control', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<DialogHarness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
  });

  it('calls onClose on Escape and restores focus to the opener', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<DialogHarness onClose={onClose} />);

    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    await user.click(opener);

    await waitFor(() => expect(screen.getByRole('button', { name: 'First' })).toHaveFocus());

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(opener).toHaveFocus();
  });
});
