'use client';

import { BrandedFeedbackMessage } from '@/shared/components/hotsite/branded-feedback-message';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

interface PickerNoticeProps {
  readonly message: string;
  readonly variant: 'hotsite' | 'dashboard';
}

/**
 * A notice the date picker shows in place of its content (fully booked): the shared feedback
 * message on the unbranded look, the branded message on the public hotsite. No retry: nothing failed.
 */
export function PickerNotice({ message, variant }: PickerNoticeProps): React.JSX.Element {
  if (variant === 'dashboard') return <FeedbackMessage title={message} />;
  return <BrandedFeedbackMessage title={message} />;
}
