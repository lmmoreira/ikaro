'use client';

import { useTranslations } from 'next-intl';
import type { FooterModuleData } from '@ikaro/types';
import { SwitchField } from '@/shared/components/ui/switch-field';
import {
  readPresentation,
  withPresentation,
} from '@/features/platform/hotsite/module-presentation';
import { SectionPresentationFields } from './SectionPresentationFields';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

export function FooterConfigPanel({ data, onChange }: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.footer');
  const footer = readModuleData<FooterModuleData>(data);

  function update(patch: Partial<FooterModuleData>): void {
    onChange(writeModuleData({ ...footer, ...patch }));
  }

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="footer-tagline">{t('taglineLabel')}</Label>
        <Input
          id="footer-tagline"
          type="text"
          value={footer.tagline ?? ''}
          placeholder={t('taglinePlaceholder')}
          onChange={(event) => update({ tagline: event.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="footer-copyright-note">{t('copyrightNoteLabel')}</Label>
        <Input
          id="footer-copyright-note"
          type="text"
          value={footer.copyrightNote ?? ''}
          placeholder={t('copyrightNotePlaceholder')}
          onChange={(event) => update({ copyrightNote: event.target.value })}
        />
      </div>

      <SwitchField
        checked={footer.showWhatsapp ?? true}
        onChange={(showWhatsapp) => update({ showWhatsapp })}
        label={t('showWhatsappLabel')}
        testId="footer-show-whatsapp"
      />
      <SectionPresentationFields
        moduleType="FOOTER"
        value={readPresentation(data)}
        onChange={(presentation) => onChange(withPresentation(data, presentation))}
      />
    </div>
  );
}
