'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { MOBILE_ACTION_BAR_CLEARANCE_CLASS } from '@/shells/dashboard/utils/mobile-action-bar';

interface SettingsFormActionsProps {
  readonly isSubmitting: boolean;
}

// Extracted from SettingsForm (TD37-S5A) — split into two exports (rather than one fragment)
// because the mobile bar is a sibling of the grid in the original markup, not nested inside the
// desktop aside — merging them into one component would change that nesting even though the
// mobile bar's `fixed` positioning makes it visually harmless either way.
export function SettingsDesktopActions({
  isSubmitting,
}: SettingsFormActionsProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');
  const commonT = useTranslations('common');

  return (
    <aside className="hidden lg:block lg:sticky lg:top-6">
      <Card>
        <CardContent className="space-y-4 p-4">
          <Button
            type="submit"
            data-testid="settings-submit-desktop"
            className="w-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? commonT('loading') : t('submit')}
          </Button>
          <hr className="border-t border-gray-200" />
          <p className="text-sm leading-6 text-gray-500">{t('actionHint')}</p>
        </CardContent>
      </Card>
    </aside>
  );
}

export function SettingsMobileActionBar({
  isSubmitting,
}: SettingsFormActionsProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');
  const commonT = useTranslations('common');

  return (
    <div
      className={`fixed inset-x-0 ${MOBILE_ACTION_BAR_CLEARANCE_CLASS} z-20 border-t border-gray-200 bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden`}
    >
      <Button
        type="submit"
        data-testid="settings-submit-mobile"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? commonT('loading') : t('submit')}
      </Button>
    </div>
  );
}
