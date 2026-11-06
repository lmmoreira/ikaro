'use client';

import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { TextField, type SettingsFieldFeedback } from './SettingsFormFields';

interface SettingsGeneralSectionProps {
  readonly slug: string;
  readonly name: string;
  readonly feedback: SettingsFieldFeedback;
  readonly onNameChange: (value: string) => void;
}

// Extracted from SettingsForm (TD37-S5A) — the "General" section (tenant name + read-only slug)
// is a self-contained, cohesive group, unrelated to the other SectionCard groups around it.
export function SettingsGeneralSection({
  slug,
  name,
  feedback,
  onNameChange,
}: SettingsGeneralSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');

  return (
    <SectionCard size="compact" title={t('sections.general')}>
      <TextField
        id="settings-name"
        label={t('nameLabel')}
        value={name}
        name="name"
        feedback={feedback}
        maxLength={100}
        onChange={onNameChange}
      />
      <div>
        <Label htmlFor="settings-slug">{t('slugLabel')}</Label>
        <Input
          id="settings-slug"
          data-testid="settings-slug-input"
          type="text"
          value={slug}
          disabled
          className="bg-gray-100 text-gray-500"
        />
        <p className="mt-1.5 text-sm text-gray-500">{t('slugHint')}</p>
      </div>
    </SectionCard>
  );
}
