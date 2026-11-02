'use client';

import Link from 'next/link';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';

interface FormActionPaneProps {
  readonly submitLabel: string;
  readonly cancelLabel: string;
  readonly cancelHref: string;
  readonly desktopSaveTestId: string;
  readonly mobileSaveTestId: string;
  readonly isSubmitting: boolean;
  readonly feedback: FeedbackModel | null;
  // Shown under the buttons of the desktop pane only; the mobile bar has no room for it.
  readonly hint?: string;
}

// The save and cancel actions of a create or edit form, desktop pane and mobile bar, with the
// form-level feedback under the buttons. Desktop and mobile each render the controls, so the
// caller gives each copy its own static test id.
export function FormActionPane({
  submitLabel,
  cancelLabel,
  cancelHref,
  desktopSaveTestId,
  mobileSaveTestId,
  isSubmitting,
  feedback,
  hint,
}: FormActionPaneProps): React.JSX.Element {
  return (
    <ActionPane
      actions={
        <>
          <Button
            type="submit"
            data-testid={desktopSaveTestId}
            className="w-full"
            disabled={isSubmitting}
          >
            {submitLabel}
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={cancelHref}>{cancelLabel}</Link>
          </Button>
          {hint && (
            <>
              <hr className="border-t border-gray-200" />
              <p className="text-sm leading-6 text-gray-500">{hint}</p>
            </>
          )}
        </>
      }
      mobileActions={
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="w-full">
            <Link href={cancelHref}>{cancelLabel}</Link>
          </Button>
          <Button
            type="submit"
            data-testid={mobileSaveTestId}
            className="w-full"
            disabled={isSubmitting}
          >
            {submitLabel}
          </Button>
        </div>
      }
      feedback={feedback}
    />
  );
}
