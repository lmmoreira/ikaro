'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import type { SettingsFormErrors, SettingsFormValues } from '@/features/platform/settings-form';
import { SuffixNumberField } from './SettingsFormFields';

interface SettingsLeadFormSectionProps {
  readonly values: SettingsFormValues;
  readonly fieldErrors: SettingsFormErrors;
  readonly onFieldChange: <K extends keyof SettingsFormValues>(
    key: K,
    value: SettingsFormValues[K],
  ) => void;
}

// All three fields are genuinely per-tenant abuse-protection knobs (docs/21-TENANTS_SETTINGS_SCHEMA.md
// §8) — unlike Chatbot's caps, there's no shared platform-cost reason to keep them Ikaro-only, so
// every field here is tenant-editable with a full client-checkable bound (see
// settings-form-validation.ts's SettingsFormSchema), same as the booking section's numeric fields.
export function SettingsLeadFormSection({
  values,
  fieldErrors,
  onFieldChange,
}: SettingsLeadFormSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');

  return (
    <SectionCard title={t('sections.leadForm')}>
      <p className="text-sm text-gray-500">{t('leadFormSectionSub')}</p>
      <SuffixNumberField
        id="settings-lead-form-retention-months"
        label={t('leadFormRetentionLabel')}
        hint={t('leadFormRetentionHint')}
        suffix={t('monthsSuffix')}
        value={values.retentionMonths}
        error={fieldErrors.retentionMonths}
        onChange={(value) => onFieldChange('retentionMonths', value)}
      />
      <SuffixNumberField
        id="settings-lead-form-max-submissions-per-day"
        label={t('leadFormMaxSubmissionsPerDayLabel')}
        hint={t('leadFormMaxSubmissionsPerDayHint')}
        suffix={t('perDaySuffix')}
        value={values.maxSubmissionsPerDay}
        error={fieldErrors.maxSubmissionsPerDay}
        onChange={(value) => onFieldChange('maxSubmissionsPerDay', value)}
      />
      <SuffixNumberField
        id="settings-lead-form-max-submissions-per-ip-per-day"
        label={t('leadFormMaxSubmissionsPerIpPerDayLabel')}
        hint={t('leadFormMaxSubmissionsPerIpPerDayHint')}
        suffix={t('perDaySuffix')}
        value={values.maxSubmissionsPerIpPerDay}
        error={fieldErrors.maxSubmissionsPerIpPerDay}
        onChange={(value) => onFieldChange('maxSubmissionsPerIpPerDay', value)}
      />
    </SectionCard>
  );
}
