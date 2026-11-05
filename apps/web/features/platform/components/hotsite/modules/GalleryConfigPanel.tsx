'use client';

import { useTranslations } from 'next-intl';
import type { GalleryModuleData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { GalleryImageManager } from './GalleryImageManager';
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

export function GalleryConfigPanel({ data, onChange }: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.gallery');
  const gallery = readModuleData<GalleryModuleData>(data);

  function update(patch: Partial<GalleryModuleData>): void {
    onChange(writeModuleData({ ...gallery, ...patch }));
  }

  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="gallery-title">{t('titleLabel')}</Label>
        <Input
          id="gallery-title"
          type="text"
          value={gallery.title ?? ''}
          placeholder={t('titlePlaceholder')}
          onChange={(event) => update({ title: event.target.value })}
        />
        <p className="mt-1 text-xs text-gray-400">{t('titleHint')}</p>
      </div>

      <div>
        <Label htmlFor="gallery-eyebrow">{t('eyebrowLabel')}</Label>
        <Input
          id="gallery-eyebrow"
          type="text"
          value={gallery.eyebrow ?? ''}
          placeholder={t('eyebrowPlaceholder')}
          onChange={(event) => update({ eyebrow: event.target.value })}
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
          { value: 'portfolio', label: t('layoutPortfolio') },
          { value: 'featured', label: t('layoutFeatured'), disabled: gallery.images.length < 3 },
        ]}
      />
      {gallery.images.length < 3 && (
        <p className="text-xs text-gray-500">{t('featuredRequiresThreeImages')}</p>
      )}
      {gallery.layout === 'featured' && gallery.images.length > 5 && (
        <p className="text-xs text-gray-500">{t('featuredUsesFirstFiveImages')}</p>
      )}

      {gallery.layout === 'featured' && gallery.images.length >= 3 && (
        <PillSelect
          label={t('featuredPositionLabel')}
          value={gallery.featuredPosition ?? 'left'}
          onChange={(featuredPosition) => update({ featuredPosition })}
          testId="gallery-featured-position"
          options={[
            { value: 'left', label: t('featuredPositionLeft') },
            { value: 'right', label: t('featuredPositionRight') },
          ]}
        />
      )}

      <div>
        <Label htmlFor="gallery-max-visible">{t('maxVisibleLabel')}</Label>
        <Input
          id="gallery-max-visible"
          type="number"
          min={1}
          value={gallery.maxVisible}
          onChange={(event) => update({ maxVisible: Number(event.target.value) || 1 })}
          className="w-32"
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-semibold text-gray-900">{t('imagesLabel')}</span>
        <GalleryImageManager images={gallery.images} onChange={(images) => update({ images })} />
      </div>
      <SectionPresentationFields
        moduleType="GALLERY"
        value={readPresentation(data)}
        onChange={(presentation) => onChange(withPresentation(data, presentation))}
      />
    </div>
  );
}
