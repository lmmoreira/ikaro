import { ActionPane as SharedActionPane } from '@/shared/components/ui/action-pane';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';

interface NewRecurringScheduleLayoutProps {
  readonly testId: string;
  /** The central content. */
  readonly children: React.ReactNode;
  /** The pane's content: the `ActionPane` note and buttons. */
  readonly pane: React.ReactNode;
  /** A failure to show under the pane's buttons. */
  readonly feedback?: FeedbackModel | null;
}

/**
 * The drill-down shape of every screen of the creation flow: central content + the shared action
 * pane (the sticky card on desktop, the fixed bottom bar on mobile).
 */
export function NewRecurringScheduleLayout({
  testId,
  children,
  pane,
  feedback = null,
}: NewRecurringScheduleLayoutProps): React.JSX.Element {
  return (
    <div className="w-full pb-40 lg:pb-0" data-testid={testId}>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">{children}</div>
        <SharedActionPane actions={pane} feedback={feedback} />
      </div>
    </div>
  );
}

/** The pane's note and buttons (the card around them comes from the shared `ActionPane`). */
export function ActionPane({
  aside,
  children,
}: {
  readonly aside: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <p className="text-sm leading-relaxed text-gray-500">{aside}</p>
      {children}
    </>
  );
}
