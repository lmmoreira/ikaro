'use client';

import { useTranslations } from 'next-intl';
import type { AboutModuleData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SingleImageUploadField } from '../SingleImageUploadField';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

export function AboutConfigPanel({ data, onChange }: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.about');
  const about = readModuleData<AboutModuleData>(data);

  function update(patch: Partial<AboutModuleData>): void {
    onChange(writeModuleData({ ...about, ...patch }));
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="about-title" className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('titleLabel')}
        </label>
        <input
          id="about-title"
          type="text"
          value={about.title}
          placeholder={t('titlePlaceholder')}
          onChange={(event) => update({ title: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="about-body" className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('bodyLabel')}
        </label>
        <textarea
          id="about-body"
          value={about.body}
          placeholder={t('bodyPlaceholder')}
          onChange={(event) => update({ body: event.target.value })}
          rows={6}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">{t('bodyHint')}</p>
      </div>

      <div>
        <label htmlFor="about-eyebrow" className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('eyebrowLabel')}
        </label>
        <input
          id="about-eyebrow"
          type="text"
          value={about.eyebrow ?? ''}
          placeholder={t('eyebrowPlaceholder')}
          onChange={(event) => update({ eyebrow: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <PillSelect
        label={t('imagePositionLabel')}
        value={about.imagePosition}
        onChange={(imagePosition) => update({ imagePosition })}
        testId="about-image-position"
        options={[
          { value: 'left', label: t('imagePositionLeft') },
          { value: 'right', label: t('imagePositionRight') },
        ]}
      />

      <SingleImageUploadField
        id="about-image"
        value={about.imageUrl ?? ''}
        onChange={(imageUrl) => update({ imageUrl })}
        purpose="about"
        previewSize="large"
        label={t('imageLabel')}
        clickToAddLabel={t('imageClickToAdd')}
        formatHintLabel={t('imageFormatHint')}
        uploadingLabel={t('imageUploading')}
        uploadErrorLabel={t('imageUploadError')}
        removeLabel={t('imageRemove')}
      />
    </div>
  );
}
