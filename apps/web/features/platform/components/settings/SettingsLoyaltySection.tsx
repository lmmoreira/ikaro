'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { SwitchField } from '@/shared/components/ui/switch-field';
import type { SettingsFormErrors, SettingsFormValues } from '@/features/platform/settings-form';
import { FieldError, INPUT_CLASS, SuffixNumberField } from './SettingsFormFields';

interface SettingsLoyaltySectionProps {
  readonly values: SettingsFormValues;
  readonly fieldErrors: SettingsFormErrors;
  readonly onFieldChange: <K extends keyof SettingsFormValues>(
    key: K,
    value: SettingsFormValues[K],
  ) => void;
}

// Extracted from SettingsForm (TD37-S5A) — the "Loyalty" section is a self-contained, cohesive
// group of loyalty-policy fields, unrelated to the other SectionCard groups around it.
export function SettingsLoyaltySection({
  values,
  fieldErrors,
  onFieldChange,
}: SettingsLoyaltySectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');

  return (
    <SectionCard title={t('sections.loyalty')}>
      <div className="grid gap-4 md:grid-cols-2">
        <SuffixNumberField
          id="settings-loyalty-expiry"
          label={t('expiryLabel')}
          hint={t('expiryHint')}
          suffix={t('daysSuffix')}
          value={values.loyaltyExpiryDays}
          error={fieldErrors.loyaltyExpiryDays}
          onChange={(value) => onFieldChange('loyaltyExpiryDays', value)}
        />
        <div>
          <label
            htmlFor="settings-points-per-unit"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('pointsLabel')}
          </label>
          <input
            id="settings-points-per-unit"
            data-testid="settings-points-per-unit-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={values.pointsPerCurrencyUnit}
            onChange={(event) => onFieldChange('pointsPerCurrencyUnit', event.target.value)}
            aria-invalid={Boolean(fieldErrors.pointsPerCurrencyUnit)}
            aria-describedby={
              fieldErrors.pointsPerCurrencyUnit ? 'settings-points-per-unit-error' : undefined
            }
            className={`${INPUT_CLASS} max-w-56`}
          />
          {!fieldErrors.pointsPerCurrencyUnit && (
            <p className="mt-1.5 text-sm text-gray-500">{t('pointsHint')}</p>
          )}
          <FieldError
            id="settings-points-per-unit-error"
            message={fieldErrors.pointsPerCurrencyUnit}
          />
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
          error={fieldErrors.loyaltyExpiryWarningDays}
          onChange={(value) => onFieldChange('loyaltyExpiryWarningDays', value)}
        />
        <div>
          <label
            htmlFor="settings-loyalty-notification-min-points"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('notificationMinPointsLabel')}
          </label>
          <input
            id="settings-loyalty-notification-min-points"
            data-testid="settings-loyalty-notification-min-points-input"
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={values.loyaltyNotificationMinPoints}
            onChange={(event) => onFieldChange('loyaltyNotificationMinPoints', event.target.value)}
            aria-invalid={Boolean(fieldErrors.loyaltyNotificationMinPoints)}
            aria-describedby={
              fieldErrors.loyaltyNotificationMinPoints
                ? 'settings-loyalty-notification-min-points-error'
                : undefined
            }
            className={`${INPUT_CLASS} max-w-56`}
          />
          {!fieldErrors.loyaltyNotificationMinPoints && (
            <p className="mt-1.5 text-sm text-gray-500">{t('notificationMinPointsHint')}</p>
          )}
          <FieldError
            id="settings-loyalty-notification-min-points-error"
            message={fieldErrors.loyaltyNotificationMinPoints}
          />
        </div>
      </div>
    </SectionCard>
  );
}
