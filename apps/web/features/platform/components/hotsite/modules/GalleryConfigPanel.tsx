'use client';

import { useTranslations } from 'next-intl';
import type { GalleryModuleData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { GalleryImageManager } from './GalleryImageManager';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

export function GalleryConfigPanel({ data, onChange }: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.gallery');
  const gallery = readModuleData<GalleryModuleData>(data);

  function update(patch: Partial<GalleryModuleData>): void {
    onChange(writeModuleData({ ...gallery, ...patch }));
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="gallery-title" className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('titleLabel')}
        </label>
        <input
          id="gallery-title"
          type="text"
          value={gallery.title ?? ''}
          placeholder={t('titlePlaceholder')}
          onChange={(event) => update({ title: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="gallery-eyebrow"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('eyebrowLabel')}
        </label>
        <input
          id="gallery-eyebrow"
          type="text"
          value={gallery.eyebrow ?? ''}
          placeholder={t('eyebrowPlaceholder')}
          onChange={(event) => update({ eyebrow: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <PillSelect
        label={t('layoutLabel')}
        value={gallery.layout}
        onChange={(layout) => update({ layout })}
        testId="gallery-layout"
        options={[
          { value: 'grid', label: t('layoutGrid') },
          { value: 'masonry', label: t('layoutMasonry') },
        ]}
      />

      <div>
        <label
          htmlFor="gallery-max-visible"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('maxVisibleLabel')}
        </label>
        <input
          id="gallery-max-visible"
          type="number"
          min={1}
          value={gallery.maxVisible}
          onChange={(event) => update({ maxVisible: Number(event.target.value) || 1 })}
          className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-gray-900">{t('imagesLabel')}</span>
        <GalleryImageManager images={gallery.images} onChange={(images) => update({ images })} />
      </div>
    </div>
  );
}
