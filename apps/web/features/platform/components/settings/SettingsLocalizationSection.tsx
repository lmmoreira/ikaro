'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { ReadOnlyField } from './SettingsFormFields';

interface SettingsLocalizationSectionProps {
  readonly countryCode: string;
  readonly currency: string;
  readonly language: string;
}

// Extracted from SettingsForm (TD37-S5A) — the read-only "Localization" section is a
// self-contained, cohesive group, unrelated to the other SectionCard groups around it.
export function SettingsLocalizationSection({
  countryCode,
  currency,
  language,
}: SettingsLocalizationSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');

  return (
    <SectionCard title={t('sections.localization')}>
      <div className="grid grid-cols-3 gap-4">
        <ReadOnlyField
          testId="settings-country-code"
          label={t('localization.countryCode')}
          value={countryCode}
        />
        <ReadOnlyField
          testId="settings-currency"
          label={t('localization.currency')}
          value={currency}
        />
        <ReadOnlyField
          testId="settings-language"
          label={t('localization.language')}
          value={language}
        />
      </div>
      <p className="text-sm text-gray-500">{t('localization.hint')}</p>
    </SectionCard>
  );
}
