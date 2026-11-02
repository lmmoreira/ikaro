'use client';

import { useTranslations } from 'next-intl';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Button } from '@/shared/components/ui/button';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';
import { MOBILE_ACTION_BAR_CLEARANCE_CLASS } from '@/shells/dashboard/utils/mobile-action-bar';

interface SettingsFormActionsProps {
  readonly isSubmitting: boolean;
  readonly feedback: FeedbackModel | null;
}

// The save action of the settings form: the sticky desktop pane and the fixed mobile bar, with
// the form-level error or success under the buttons (TD57-S09). There is no cancel link, so the
// shared `FormActionPane` does not fit; this composes `ActionPane` directly.
export function SettingsActionPane({
  isSubmitting,
  feedback,
}: SettingsFormActionsProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');
  const commonT = useTranslations('common');
  const submitLabel = isSubmitting ? commonT('loading') : t('submit');

  return (
    <ActionPane
      actions={
        <>
          <Button
            type="submit"
            data-testid="settings-submit-desktop"
            className="w-full"
            disabled={isSubmitting}
          >
            {submitLabel}
          </Button>
          <hr className="border-t border-gray-200" />
          <p className="text-sm leading-6 text-gray-500">{t('actionHint')}</p>
        </>
      }
      mobileActions={
        <Button
          type="submit"
          data-testid="settings-submit-mobile"
          className="w-full"
          disabled={isSubmitting}
        >
          {submitLabel}
        </Button>
      }
      mobileOffsetClassName={MOBILE_ACTION_BAR_CLEARANCE_CLASS}
      feedback={feedback}
    />
  );
}
