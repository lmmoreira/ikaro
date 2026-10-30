import { Card, CardContent } from '@/shared/components/ui/card';
import { FeedbackMessage, type FeedbackModel } from '@/shared/components/ui/feedback-message';
import { cn } from '@/shared/utils/cn';

const DEFAULT_FEEDBACK_TEST_ID = 'form-feedback';

interface ActionPaneProps {
  readonly actions: React.ReactNode;
  readonly mobileActions?: React.ReactNode;
  readonly feedback?: FeedbackModel | null;
  readonly mobileOffsetClassName?: string;
}

function PaneFeedback({
  feedback,
  testId,
}: Readonly<{ feedback: FeedbackModel; testId: string }>): React.JSX.Element {
  return (
    <FeedbackMessage
      variant={feedback.variant}
      title={feedback.title}
      hint={feedback.hint}
      onRetry={feedback.onRetry}
      retryLabel={feedback.retryLabel}
      testId={testId}
    >
      {feedback.body}
    </FeedbackMessage>
  );
}

export function ActionPane({
  actions,
  mobileActions,
  feedback = null,
  mobileOffsetClassName = 'bottom-0',
}: ActionPaneProps): React.JSX.Element {
  const barActions = mobileActions === undefined ? actions : mobileActions;
  const feedbackTestId = feedback?.testId ?? DEFAULT_FEEDBACK_TEST_ID;

  return (
    <>
      <aside data-testid="action-pane-desktop" className="hidden lg:block lg:sticky lg:top-6">
        <Card>
          <CardContent className="space-y-4 p-4">{actions}</CardContent>
        </Card>
        {feedback && (
          <div className="mt-3">
            <PaneFeedback feedback={feedback} testId={feedbackTestId} />
          </div>
        )}
      </aside>

      {barActions && (
        <div
          data-testid="action-pane-mobile"
          className={cn(
            'fixed inset-x-0 z-20 flex flex-col gap-2 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden',
            mobileOffsetClassName,
          )}
        >
          {feedback && (
            <div className="max-h-[6.5rem] overflow-y-auto">
              <PaneFeedback feedback={feedback} testId={`${feedbackTestId}-mobile`} />
            </div>
          )}
          {barActions}
        </div>
      )}
    </>
  );
}
