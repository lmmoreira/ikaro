// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { BookingActionSheetShell } from './BookingActionSheetShell';

type ShellProps = Partial<React.ComponentProps<typeof BookingActionSheetShell>>;

function renderShell(props: ShellProps = {}) {
  const onClose = props.onClose ?? vi.fn();
  render(
    <BookingActionSheetShell
      title="Title"
      description="Description"
      onClose={onClose}
      onSubmit={(event) => event.preventDefault()}
      cancelLabel="Cancel"
      submitLabel="Submit"
      error={null}
      {...props}
    >
      <input aria-label="field" />
    </BookingActionSheetShell>,
  );
  return { onClose };
}

describe('BookingActionSheetShell', () => {
  it('renders a modal dialog labelled by its title and described by its description', () => {
    renderShell();

    const dialog = screen.getByRole('dialog', { name: 'Title' });
    expect(dialog).toHaveAccessibleDescription('Description');
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('has no description relation when none is given', () => {
    renderShell({ description: undefined });

    expect(screen.getByRole('dialog', { name: 'Title' })).not.toHaveAttribute('aria-describedby');
  });

  it('invokes the close handler from the header button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderShell();

    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('invokes the close handler from the footer cancel button', async () => {
    const user = userEvent.setup();
    const { onClose } = renderShell();

    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[1]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    const { onClose } = renderShell();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the backdrop is clicked, but not when the sheet itself is', async () => {
    const user = userEvent.setup();
    const { onClose } = renderShell();

    await user.click(screen.getByRole('dialog', { name: 'Title' }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(document.querySelector('.bg-black\\/40') as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submits the form without closing', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.SubmitEvent<HTMLFormElement>) => event.preventDefault());
    const { onClose } = renderShell({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables the submit button when asked', () => {
    renderShell({ submitDisabled: true });

    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('hands the dialog content element to contentRef', () => {
    const contentRef = vi.fn();
    renderShell({ contentRef });

    expect(contentRef).toHaveBeenCalledWith(screen.getByRole('dialog', { name: 'Title' }));
  });

  it('moves focus into the sheet and returns it to the opener when the sheet unmounts', async () => {
    const user = userEvent.setup();
    function Opener() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open ? (
            <BookingActionSheetShell
              title="Title"
              description="Description"
              onClose={() => setOpen(false)}
              onSubmit={(event) => event.preventDefault()}
              cancelLabel="Cancel"
              submitLabel="Submit"
              error={null}
            >
              <input aria-label="field" />
            </BookingActionSheetShell>
          ) : null}
        </>
      );
    }
    render(<Opener />);
    const opener = screen.getByRole('button', { name: 'Open' });

    await user.click(opener);
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement),
    );

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Radix restores focus on the next tick after the sheet unmounts.
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('renders the failure as the shared FeedbackMessage (role alert), not a hand-rolled red box', () => {
    renderShell({ error: 'Problem' });

    const feedback = screen.getByTestId('action-sheet-error');
    expect(feedback).toHaveAttribute('role', 'alert');
    expect(feedback).toHaveTextContent('Problem');
    expect(feedback.className).not.toContain('bg-red-50 px-3 py-2');
  });

  it('renders nothing when there is no error', () => {
    renderShell({ description: undefined });

    expect(screen.queryByTestId('action-sheet-error')).not.toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    renderShell();

    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });
});
