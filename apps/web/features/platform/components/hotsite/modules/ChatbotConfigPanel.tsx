'use client';

import { useTranslations } from 'next-intl';
import type { ChatbotModuleData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { useChatbotCapStatus } from '@/features/platform/hotsite/useHotsite';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

// The only module config panel that reads its own data (GET /tenants/chatbot/cap-status) rather
// than operating purely on `data`/`onChange` — see docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md §
// CHATBOT and docs/04-USE_CASES.md UC-027 A5. Every other module type's availability is fully
// derived from the manifest; CHATBOT's isn't (platform-wide provider health, per-tenant caps),
// which is why this panel carries a standing disclosure note no other panel has, plus a
// conditional daily-cap-reached banner sourced from a live read instead of `draft.layout`.
export function ChatbotConfigPanel({ data, onChange }: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.chatbot');
  const chatbot = readModuleData<ChatbotModuleData>(data);
  const { data: capStatus } = useChatbotCapStatus();

  function update(patch: Partial<ChatbotModuleData>): void {
    onChange(writeModuleData({ ...chatbot, ...patch }));
  }

  return (
    <div className="space-y-5">
      {capStatus?.dailyCapReachedToday === true && (
        <div
          role="alert"
          data-testid="chatbot-cap-reached-banner"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
        >
          <p className="font-semibold">{t('capReachedBannerTitle')}</p>
          <p className="mt-1">{t('capReachedBannerBody')}</p>
        </div>
      )}

      <div
        data-testid="chatbot-availability-note"
        className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"
      >
        <p className="font-semibold">{t('availabilityNoteTitle')}</p>
        <p className="mt-1">{t('availabilityNoteBody')}</p>
      </div>

      <div>
        <label
          htmlFor="chatbot-bot-name"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('botNameLabel')}
        </label>
        <input
          id="chatbot-bot-name"
          type="text"
          value={chatbot.botName ?? ''}
          placeholder={t('botNamePlaceholder')}
          onChange={(event) => update({ botName: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">{t('botNameHint')}</p>
      </div>

      <div>
        <label
          htmlFor="chatbot-welcome-message"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('welcomeMessageLabel')}
        </label>
        <textarea
          id="chatbot-welcome-message"
          value={chatbot.welcomeMessage ?? ''}
          placeholder={t('welcomeMessagePlaceholder')}
          onChange={(event) => update({ welcomeMessage: event.target.value })}
          rows={2}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">{t('welcomeMessageHint')}</p>
      </div>

      <PillSelect
        label={t('variantLabel')}
        value={chatbot.variant ?? 'bubble'}
        onChange={(variant) => update({ variant })}
        testId="chatbot-variant"
        options={[
          { value: 'bubble', label: t('variantBubble') },
          { value: 'inline', label: t('variantInline') },
        ]}
      />

      <PillSelect
        label={t('accentColorLabel')}
        value={chatbot.accentColor ?? 'primary'}
        onChange={(accentColor) => update({ accentColor })}
        testId="chatbot-accent-color"
        options={[
          { value: 'primary', label: t('accentColorPrimary') },
          { value: 'secondary', label: t('accentColorSecondary') },
        ]}
      />
    </div>
  );
}
