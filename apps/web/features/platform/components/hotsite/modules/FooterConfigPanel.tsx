'use client';

import { useTranslations } from 'next-intl';
import type { FooterModuleData } from '@ikaro/types';
import { SwitchField } from '@/shared/components/ui/switch-field';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

export function FooterConfigPanel({ data, onChange }: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.footer');
  const footer = readModuleData<FooterModuleData>(data);

  function update(patch: Partial<FooterModuleData>): void {
    onChange(writeModuleData({ ...footer, ...patch }));
  }

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="footer-tagline"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('taglineLabel')}
        </label>
        <input
          id="footer-tagline"
          type="text"
          value={footer.tagline ?? ''}
          placeholder={t('taglinePlaceholder')}
          onChange={(event) => update({ tagline: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="footer-copyright-note"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('copyrightNoteLabel')}
        </label>
        <input
          id="footer-copyright-note"
          type="text"
          value={footer.copyrightNote ?? ''}
          placeholder={t('copyrightNotePlaceholder')}
          onChange={(event) => update({ copyrightNote: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <SwitchField
        checked={footer.showWhatsapp ?? true}
        onChange={(showWhatsapp) => update({ showWhatsapp })}
        label={t('showWhatsappLabel')}
        testId="footer-show-whatsapp"
      />
    </div>
  );
}
