// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState, type RefObject } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookingActionSheetShell } from './BookingActionSheetShell';

function Harness(): React.JSX.Element {
  const [error, setError] = useState<string | null>('Problem');
  const dialogRef = useRef<HTMLDivElement | null>(null);

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

    expect(screen.getByRole('dialog', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    expect(screen.getByText('Problem')).toBeInTheDocument();
  });

  it('invokes the close handler from the header button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const dialogRef = {
      current: document.createElement('div'),
    } as RefObject<HTMLDivElement | null>;

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

    await user.click(screen.getAllByRole('button', { name: 'Cancel' })[0]);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
