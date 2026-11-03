'use client';

import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import { ErrorAlert } from './ErrorAlert';

interface PickerLoadErrorProps {
  readonly message: string;
  readonly onRetry: () => void;
  readonly retryLabel: string;
  readonly variant: 'hotsite' | 'dashboard';
}

/**
 * The load failure of the date and slot pickers: the shared feedback message on the unbranded
 * (customer account) look, the branded alert on the public hotsite.
 */
export function PickerLoadError({
  message,
  onRetry,
  retryLabel,
  variant,
}: PickerLoadErrorProps): React.JSX.Element {
  if (variant === 'dashboard') {
    return <FeedbackMessage title={message} onRetry={onRetry} retryLabel={retryLabel} />;
  }
  return (
    <ErrorAlert onRetry={onRetry} retryLabel={retryLabel} variant={variant}>
      {message}
    </ErrorAlert>
  );
}
