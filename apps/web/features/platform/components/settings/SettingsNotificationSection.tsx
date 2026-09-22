'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { TextField } from './SettingsFormFields';

interface SettingsNotificationSectionProps {
  readonly notificationFromEmail: string;
  readonly notificationFromEmailError: string | undefined;
  readonly onChange: (value: string) => void;
}

// Extracted from SettingsForm (TD37-S5A) — the "Notification" section is a self-contained,
// cohesive group, unrelated to the other SectionCard groups around it.
export function SettingsNotificationSection({
  notificationFromEmail,
  notificationFromEmailError,
  onChange,
}: SettingsNotificationSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');

  return (
    <SectionCard title={t('sections.notification')}>
      <TextField
        id="settings-notification-from-email"
        label={t('notificationFromEmailLabel')}
        hint={t('notificationFromEmailHint')}
        type="email"
        value={notificationFromEmail}
        error={notificationFromEmailError}
        placeholder={t('emailPlaceholder')}
        onChange={onChange}
      />
    </SectionCard>
  );
}
