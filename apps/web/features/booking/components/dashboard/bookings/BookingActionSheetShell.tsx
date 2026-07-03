'use client';

import type { ReactNode, RefObject, SubmitEvent } from 'react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/cn';

interface BookingActionSheetShellProps {
  readonly dialogRef: RefObject<HTMLDialogElement | null>;
  readonly titleId: string;
  readonly descriptionId: string;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly onClose: () => void;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void | Promise<void>;
  readonly cancelLabel: string;
  readonly submitLabel: string;
  readonly submitVariant?: 'default' | 'destructive';
  readonly submitDisabled?: boolean;
  readonly error: string | null;
  readonly children: ReactNode;
}

export function BookingActionSheetShell({
  dialogRef,
  titleId,
  descriptionId,
  title,
  description,
  onClose,
  onSubmit,
  cancelLabel,
  submitLabel,
  submitVariant = 'default',
  submitDisabled = false,
  error,
  children,
}: BookingActionSheetShellProps): React.JSX.Element {
  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh w-dvw max-h-none max-w-none border-0 bg-transparent p-0"
    >
      <div aria-hidden="true" className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <form
          onSubmit={onSubmit}
          className={cn(
            'w-full border border-gray-200 bg-white p-4 shadow-2xl sm:max-w-lg sm:rounded-2xl',
            'rounded-t-2xl',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p id={titleId} className="text-sm font-semibold text-gray-900">
                {title}
              </p>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-gray-500">
                  {description}
                </p>
              ) : null}
            </div>
            <button type="button" onClick={onClose} className="text-sm font-semibold text-gray-500">
              {cancelLabel}
            </button>
          </div>

          {children}

          {error && (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
      </div>
    </dialog>
  );
}
