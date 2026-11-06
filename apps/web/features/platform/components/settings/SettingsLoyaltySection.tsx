'use client';

import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { SwitchField } from '@/shared/components/ui/switch-field';
import { FieldFeedback } from '@/shared/components/ui/field-feedback';
import type { SettingsFormValues } from '@/features/platform/settings-form';
import {
  SuffixNumberField,
  settingsFieldWiring,
  type SettingsFieldFeedback,
} from './SettingsFormFields';

interface SettingsLoyaltySectionProps {
  readonly values: SettingsFormValues;
  readonly feedback: SettingsFieldFeedback;
  readonly onFieldChange: <K extends keyof SettingsFormValues>(
    key: K,
    value: SettingsFormValues[K],
  ) => void;
}

// Extracted from SettingsForm (TD37-S5A) — the "Loyalty" section is a self-contained, cohesive
// group of loyalty-policy fields, unrelated to the other SectionCard groups around it.
export function SettingsLoyaltySection({
  values,
  feedback,
  onFieldChange,
}: SettingsLoyaltySectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');
  const points = settingsFieldWiring(
    feedback,
    'pointsPerCurrencyUnit',
    'settings-points-per-unit',
    t('pointsHint'),
  );
  const minPoints = settingsFieldWiring(
    feedback,
    'loyaltyNotificationMinPoints',
    'settings-loyalty-notification-min-points',
    t('notificationMinPointsHint'),
  );

  return (
    <SectionCard size="compact" title={t('sections.loyalty')}>
      <div className="grid gap-4 md:grid-cols-2">
        <SuffixNumberField
          id="settings-loyalty-expiry"
          label={t('expiryLabel')}
          hint={t('expiryHint')}
          suffix={t('daysSuffix')}
          value={values.loyaltyExpiryDays}
          name="loyaltyExpiryDays"
          feedback={feedback}
          onChange={(value) => onFieldChange('loyaltyExpiryDays', value)}
        />
        <div>
          <Label htmlFor="settings-points-per-unit">{t('pointsLabel')}</Label>
          <Input
            id="settings-points-per-unit"
            data-testid="settings-points-per-unit-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={values.pointsPerCurrencyUnit}
            onChange={(event) => onFieldChange('pointsPerCurrencyUnit', event.target.value)}
            {...points.inputProps}
            className={points.inputClassName('max-w-56')}
          />
          {!points.error && (
            <p id={points.hintId} className="mt-1.5 text-sm text-gray-500">
              {t('pointsHint')}
            </p>
          )}
          <FieldFeedback id={points.errorId}>{points.error}</FieldFeedback>
        </div>
      </div>
      <SwitchField
        testId="settings-loyalty-notifications-switch"
        checked={values.loyaltyEnableNotifications}
        onChange={(checked) => onFieldChange('loyaltyEnableNotifications', checked)}
        label={t('loyaltyEnableNotificationsLabel')}
        hint={t('loyaltyEnableNotificationsHint')}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SuffixNumberField
          id="settings-loyalty-expiry-warning"
          label={t('expiryWarningLabel')}
          hint={t('expiryWarningHint')}
          suffix={t('daysSuffix')}
          value={values.loyaltyExpiryWarningDays}
          name="loyaltyExpiryWarningDays"
          feedback={feedback}
          onChange={(value) => onFieldChange('loyaltyExpiryWarningDays', value)}
        />
        <div>
          <Label htmlFor="settings-loyalty-notification-min-points">
            {t('notificationMinPointsLabel')}
          </Label>
          <Input
            id="settings-loyalty-notification-min-points"
            data-testid="settings-loyalty-notification-min-points-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={values.loyaltyNotificationMinPoints}
            onChange={(event) => onFieldChange('loyaltyNotificationMinPoints', event.target.value)}
            {...minPoints.inputProps}
            className={minPoints.inputClassName('max-w-56')}
          />
          {!minPoints.error && (
            <p id={minPoints.hintId} className="mt-1.5 text-sm text-gray-500">
              {t('notificationMinPointsHint')}
            </p>
          )}
          <FieldFeedback id={minPoints.errorId}>{minPoints.error}</FieldFeedback>
        </div>
      </div>
    </SectionCard>
  );
}
