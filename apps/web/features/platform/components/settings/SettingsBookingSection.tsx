'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { SwitchField } from '@/shared/components/ui/switch-field';
import {
  SLOT_GRANULARITY_OPTIONS,
  type SettingsFormErrors,
  type SettingsFormValues,
} from '@/features/platform/settings-form';
import { SelectField, SuffixNumberField } from './SettingsFormFields';

interface SettingsBookingSectionProps {
  readonly values: SettingsFormValues;
  readonly fieldErrors: SettingsFormErrors;
  readonly onFieldChange: <K extends keyof SettingsFormValues>(
    key: K,
    value: SettingsFormValues[K],
  ) => void;
}

// Extracted from SettingsForm (TD37-S5A) — the "Booking" section is a self-contained, cohesive
// group of booking-policy fields, unrelated to the other SectionCard groups around it.
export function SettingsBookingSection({
  values,
  fieldErrors,
  onFieldChange,
}: SettingsBookingSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');

  return (
    <SectionCard title={t('sections.booking')}>
      <div className="grid gap-4 md:grid-cols-2">
        <SuffixNumberField
          id="settings-cancellation-window"
          label={t('cancellationLabel')}
          hint={t('cancellationHint')}
          suffix={t('hoursSuffix')}
          value={values.cancellationWindowHours}
          error={fieldErrors.cancellationWindowHours}
          onChange={(value) => onFieldChange('cancellationWindowHours', value)}
        />
        <SuffixNumberField
          id="settings-service-buffer"
          label={t('bufferLabel')}
          hint={t('bufferHint')}
          suffix={t('minutesSuffix')}
          value={values.serviceBufferMinutes}
          error={fieldErrors.serviceBufferMinutes}
          onChange={(value) => onFieldChange('serviceBufferMinutes', value)}
        />
      </div>
      <SwitchField
        testId="settings-auto-approve-switch"
        checked={values.autoApproveEnabled}
        onChange={(checked) => onFieldChange('autoApproveEnabled', checked)}
        label={t('autoApproveLabel')}
        hint={t('autoApproveHint')}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SuffixNumberField
          id="settings-min-advance-hours"
          label={t('minBookingAdvanceLabel')}
          hint={t('minBookingAdvanceHint')}
          suffix={t('hoursSuffix')}
          value={values.minBookingAdvanceHours}
          error={fieldErrors.minBookingAdvanceHours}
          onChange={(value) => onFieldChange('minBookingAdvanceHours', value)}
        />
        <SuffixNumberField
          id="settings-max-advance-days"
          label={t('maxBookingAdvanceLabel')}
          hint={t('maxBookingAdvanceHint')}
          suffix={t('daysSuffix')}
          value={values.maxBookingAdvanceDays}
          error={fieldErrors.maxBookingAdvanceDays}
          onChange={(value) => onFieldChange('maxBookingAdvanceDays', value)}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField
          id="settings-slot-granularity"
          label={t('slotGranularityLabel')}
          hint={t('slotGranularityHint')}
          value={values.slotGranularityMinutes}
          error={fieldErrors.slotGranularityMinutes}
          options={SLOT_GRANULARITY_OPTIONS.map((minutes) => ({
            value: String(minutes),
            label: t('minutesValue', { minutes }),
          }))}
          onChange={(value) => onFieldChange('slotGranularityMinutes', value)}
        />
        <SuffixNumberField
          id="settings-welcome-staff-screen-days"
          label={t('welcomeStaffScreenLabel')}
          hint={t('welcomeStaffScreenHint')}
          suffix={t('daysSuffix')}
          value={values.welcomeStaffScreenDays}
          error={fieldErrors.welcomeStaffScreenDays}
          onChange={(value) => onFieldChange('welcomeStaffScreenDays', value)}
        />
      </div>
    </SectionCard>
  );
}
