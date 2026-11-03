// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useRef, useState, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookingActionSheetShell } from './BookingActionSheetShell';

function Harness(): React.JSX.Element {
  const [error, setError] = useState<string | null>('Problem');
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId="title"
      descriptionId="description"
      title="Title"
      description="Description"
      onClose={() => setError(null)}
      onSubmit={(event) => event.preventDefault()}
      cancelLabel="Cancel"
      submitLabel="Submit"
      submitDisabled={false}
      error={error}
    >
      <input aria-label="field" />
    </BookingActionSheetShell>
  );
}

describe('BookingActionSheetShell', () => {
  it('renders the dialog content and actions', () => {
    render(<Harness />);

    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Cancel', hidden: true })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Submit', hidden: true })).toBeInTheDocument();
    expect(screen.getByText('Problem')).toBeInTheDocument();
  });

  it('invokes the close handler from the header button', async () => {
    const onClose = vi.fn();
    const dialogRef = {
      current: document.createElement('dialog'),
    } as RefObject<HTMLDialogElement | null>;

    render(
      <BookingActionSheetShell
        dialogRef={dialogRef}
        titleId="title"
        descriptionId="description"
        title="Title"
        description="Description"
        onClose={onClose}
        onSubmit={(event) => event.preventDefault()}
        cancelLabel="Cancel"
        submitLabel="Submit"
        submitDisabled={false}
        error={null}
      >
        <input aria-label="field" />
      </BookingActionSheetShell>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel', hidden: true })[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the failure as the shared FeedbackMessage (role alert), not a hand-rolled red box', () => {
    render(<Harness />);

    const feedback = screen.getByTestId('action-sheet-error');
    expect(feedback).toHaveAttribute('role', 'alert');
    expect(feedback).toHaveTextContent('Problem');
    expect(feedback.className).not.toContain('bg-red-50 px-3 py-2');
  });

  it('renders nothing when there is no error', () => {
    const dialogRef = {
      current: document.createElement('dialog'),
    } as RefObject<HTMLDialogElement | null>;
    render(
      <BookingActionSheetShell
        dialogRef={dialogRef}
        titleId="title"
        descriptionId="description"
        title="Title"
        onClose={vi.fn()}
        onSubmit={(event) => event.preventDefault()}
        cancelLabel="Cancel"
        submitLabel="Submit"
        error={null}
      >
        <input aria-label="field" />
      </BookingActionSheetShell>,
    );

    expect(screen.queryByTestId('action-sheet-error')).not.toBeInTheDocument();
  });
});
