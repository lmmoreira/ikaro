'use client';

import type { ReactNode, Ref, SubmitEvent } from 'react';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

interface BookingActionSheetShellProps {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly onClose: () => void;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void | Promise<void>;
  readonly cancelLabel: string;
  readonly submitLabel: string;
  readonly submitVariant?: 'default' | 'destructive';
  readonly submitDisabled?: boolean;
  readonly error: string | null;
  // The dialog's content element: a popover opened from inside the sheet portals into it, because
  // a modal dialog leaves everything outside itself inert.
  readonly contentRef?: Ref<HTMLDivElement>;
  readonly children: ReactNode;
}

// A booking molecule on the shared `ui/dialog`: a bottom sheet on mobile, a centred card from `sm`.
// The caller mounts it only while the sheet is open, so it is always open here; Escape, a backdrop
// click and the cancel button all end in `onClose`. Radix traps focus, restores it to the opener
// and links the title and description to the dialog.
export function BookingActionSheetShell({
  title,
  description,
  onClose,
  onSubmit,
  cancelLabel,
  submitLabel,
  submitVariant = 'default',
  submitDisabled = false,
  error,
  contentRef,
  children,
}: BookingActionSheetShellProps): React.JSX.Element {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        ref={contentRef}
        overlayClassName="bg-black/40"
        // Without a description there is nothing to point at (Radix would warn about a missing one).
        {...(description ? {} : { 'aria-describedby': undefined })}
        className="inset-x-0 bottom-0 top-auto block w-full max-w-none translate-x-0 translate-y-0 gap-0 rounded-b-none rounded-t-2xl p-4 shadow-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <form onSubmit={onSubmit}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription className="mt-1">{description}</DialogDescription>
              ) : null}
            </div>
            <button type="button" onClick={onClose} className="text-sm font-semibold text-gray-500">
              {cancelLabel}
            </button>
          </div>

          {children}

          {error && (
            <div className="mt-3">
              <FeedbackMessage title={error} testId="action-sheet-error" />
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={submitVariant}
              className="flex-1"
              disabled={submitDisabled}
            >
              {submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
