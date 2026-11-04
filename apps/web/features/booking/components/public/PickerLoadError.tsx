'use client';

import { BrandedFeedbackMessage } from '@/shared/components/hotsite/branded-feedback-message';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

interface PickerLoadErrorProps {
  readonly message: string;
  readonly onRetry: () => void;
  readonly retryLabel: string;
  readonly variant: 'hotsite' | 'dashboard';
}

/**
 * The load failure of the date and slot pickers: the shared feedback message on the unbranded
 * (customer account) look, the branded message on the public hotsite.
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
  return <BrandedFeedbackMessage title={message} onRetry={onRetry} retryLabel={retryLabel} />;
}
