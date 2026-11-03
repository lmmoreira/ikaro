'use client';

import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import { cn } from '@/shared/utils/cn';

const NOTICE_CLASS = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-orange-200 bg-orange-50 text-orange-800',
} as const;

interface ConfirmPageProps {
  readonly testId?: string;
  readonly title: string;
  readonly subtitle: string;
  readonly sectionLabel: string;
  readonly summary: React.ReactNode;
  readonly notice: React.ReactNode;
  readonly noticeTone: keyof typeof NOTICE_CLASS;
  readonly asideNote: string;
  readonly confirmLabel: string;
  readonly confirmTestId?: string;
  readonly keepLabel: string;
  readonly isSubmitting: boolean;
  readonly onConfirm: () => void;
  readonly onKeep: () => void;
  readonly feedback: FeedbackModel | null;
  readonly feedbackTestId: string;
}

/**
 * The customer account's "are you sure?" screen (cancel a booking, end a recurrence, cancel an
 * alert): the title, the note and the summary in one first card level with the action pane, the
 * destructive action and the way back in the pane, and the failure under those buttons.
 */
export function ConfirmPage({
  testId,
  title,
  subtitle,
  sectionLabel,
  summary,
  notice,
  noticeTone,
  asideNote,
  confirmLabel,
  confirmTestId,
  keepLabel,
  isSubmitting,
  onConfirm,
  onKeep,
  feedback,
  feedbackTestId,
}: ConfirmPageProps): React.JSX.Element {
  const confirm = (
    <Button
      type="button"
      variant="destructive"
      className="w-full"
      data-testid={confirmTestId}
      onClick={onConfirm}
      disabled={isSubmitting}
    >
      {confirmLabel}
    </Button>
  );
  const keep = (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={onKeep}
      disabled={isSubmitting}
    >
      {keepLabel}
    </Button>
  );

  return (
    <div className="w-full pb-40 lg:pb-0" data-testid={testId}>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <Card className="rounded-xl border-gray-100 p-4 shadow-none">
            <h1 className="text-lg font-bold text-gray-900">{title}</h1>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            <p className="mb-2.5 mt-4 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
              {sectionLabel}
            </p>
            {summary}
          </Card>

          <div
            className={cn(
              'rounded-xl border p-3.5 text-sm leading-relaxed',
              NOTICE_CLASS[noticeTone],
            )}
          >
            {notice}
          </div>
        </div>

        <ActionPane
          actions={
            <>
              <p className="text-sm leading-relaxed text-gray-500">{asideNote}</p>
              {confirm}
              {keep}
            </>
          }
          mobileActions={
            <div className="grid grid-cols-2 gap-3">
              {keep}
              {confirm}
            </div>
          }
          feedback={feedback === null ? null : { ...feedback, testId: feedbackTestId }}
        />
      </div>
    </div>
  );
}
