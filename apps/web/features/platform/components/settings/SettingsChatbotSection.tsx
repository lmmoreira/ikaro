'use client';

import { useTranslations } from 'next-intl';
import { SectionCard } from '@/shared/components/ui/section-card';
import { TextareaField } from './SettingsFormFields';

interface SettingsChatbotSectionProps {
  readonly knowledgeText: string;
  readonly knowledgeTextError: string | undefined;
  readonly onChange: (value: string) => void;
}

// knowledgeText is the only tenant-editable field in the chatbot settings category
// (docs/21-TENANTS_SETTINGS_SCHEMA.md §7) — no client-side length cap by design, since the
// resolved max is a per-tenant Ikaro-only override never exposed to this form. The server's
// 400 PLATFORM_SETTINGS_CHATBOT_KNOWLEDGE_TEXT_TOO_LONG is the sole backstop (see SettingsForm's
// submit handler, which maps that error's field back to knowledgeTextError).
export function SettingsChatbotSection({
  knowledgeText,
  knowledgeTextError,
  onChange,
}: SettingsChatbotSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');

  return (
    <SectionCard title={t('sections.chatbot')}>
      <TextareaField
        id="settings-chatbot-knowledge-text"
        label={t('chatbotKnowledgeTextLabel')}
        hint={t('chatbotKnowledgeTextHint')}
        placeholder={t('chatbotKnowledgeTextPlaceholder')}
        value={knowledgeText}
        error={knowledgeTextError}
        onChange={onChange}
      />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
        <p className="text-sm leading-6 text-amber-900/90">{t('chatbotCapsElsewhereNote')}</p>
      </div>
    </SectionCard>
  );
}
