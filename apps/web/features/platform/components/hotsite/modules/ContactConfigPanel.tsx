'use client';

import { useTranslations } from 'next-intl';
import type { ContactModuleData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SwitchField } from '@/shared/components/ui/switch-field';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

export function ContactConfigPanel({ data, onChange }: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.contact');
  const contact = readModuleData<ContactModuleData>(data);

  function update(patch: Partial<ContactModuleData>): void {
    onChange(writeModuleData({ ...contact, ...patch }));
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="contact-title" className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('titleLabel')}
        </label>
        <input
          id="contact-title"
          type="text"
          value={contact.title ?? ''}
          placeholder={t('titlePlaceholder')}
          onChange={(event) => update({ title: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="contact-eyebrow"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('eyebrowLabel')}
        </label>
        <input
          id="contact-eyebrow"
          type="text"
          value={contact.eyebrow ?? ''}
          placeholder={t('eyebrowPlaceholder')}
          onChange={(event) => update({ eyebrow: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <SwitchField
        checked={contact.showAddress}
        onChange={(showAddress) => update({ showAddress })}
        label={t('showAddressLabel')}
        testId="contact-show-address"
      />
      <SwitchField
        checked={contact.showPhone}
        onChange={(showPhone) => update({ showPhone })}
        label={t('showPhoneLabel')}
        testId="contact-show-phone"
      />
      <SwitchField
        checked={contact.showWhatsapp}
        onChange={(showWhatsapp) => update({ showWhatsapp })}
        label={t('showWhatsappLabel')}
        testId="contact-show-whatsapp"
      />
      <SwitchField
        checked={contact.showEmail}
        onChange={(showEmail) => update({ showEmail })}
        label={t('showEmailLabel')}
        testId="contact-show-email"
      />
      <SwitchField
        checked={contact.showMap}
        onChange={(showMap) => update({ showMap })}
        label={t('showMapLabel')}
        testId="contact-show-map"
      />
      <SwitchField
        checked={contact.showInstagram ?? true}
        onChange={(showInstagram) => update({ showInstagram })}
        label={t('showInstagramLabel')}
        testId="contact-show-instagram"
      />
      <SwitchField
        checked={contact.showFacebook ?? true}
        onChange={(showFacebook) => update({ showFacebook })}
        label={t('showFacebookLabel')}
        testId="contact-show-facebook"
      />

      <PillSelect
        label={t('displayStyleLabel')}
        value={contact.displayStyle ?? 'list'}
        onChange={(displayStyle) => update({ displayStyle })}
        testId="contact-display-style"
        options={[
          { value: 'list', label: t('displayStyleList') },
          { value: 'icon-cards', label: t('displayStyleIconCards') },
        ]}
      />

      <div>
        <label
          htmlFor="contact-whatsapp-cta-label"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('whatsappCtaLabelLabel')}
        </label>
        <input
          id="contact-whatsapp-cta-label"
          type="text"
          value={contact.whatsappCtaLabel ?? ''}
          placeholder={t('whatsappCtaLabelPlaceholder')}
          onChange={(event) => update({ whatsappCtaLabel: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
