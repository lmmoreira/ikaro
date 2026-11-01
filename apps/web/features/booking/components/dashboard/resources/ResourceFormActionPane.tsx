'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ActionPane } from '@/shared/components/ui/action-pane';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import { Button } from '@/shared/components/ui/button';

interface ResourceFormActionPaneProps {
  readonly submitLabel: string;
  readonly desktopSaveTestId: string;
  readonly mobileSaveTestId: string;
  readonly isSubmitting: boolean;
  readonly feedback: FeedbackModel | null;
}

// The save and cancel actions of the resource create and edit forms, desktop pane and mobile bar,
// with the form-level feedback under the buttons. Desktop and mobile each render the controls, so
// the caller gives each copy its own static test id.
export function ResourceFormActionPane({
  submitLabel,
  desktopSaveTestId,
  mobileSaveTestId,
  isSubmitting,
  feedback,
}: ResourceFormActionPaneProps): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');

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
            <Link href="/dashboard/resources">{t('cancel')}</Link>
          </Button>
        </>
      }
      mobileActions={
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard/resources">{t('cancel')}</Link>
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
