'use client';

import { useTranslations } from 'next-intl';
import type { HeroModuleData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { SingleImageUploadField } from '../SingleImageUploadField';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

type CtaTarget = HeroModuleData['ctaTarget'];

export function HeroConfigPanel({ data, onChange }: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.hero');
  const hero = readModuleData<HeroModuleData>(data);

  function update(patch: Partial<HeroModuleData>): void {
    onChange(writeModuleData({ ...hero, ...patch }));
  }

  const ctaTargetOptions: ReadonlyArray<{ readonly value: CtaTarget; readonly label: string }> = [
    { value: 'booking-form', label: t('ctaTargetBookingForm') },
    { value: 'service-list', label: t('ctaTargetServiceList') },
    { value: 'gallery', label: t('ctaTargetGallery') },
    { value: 'testimonials', label: t('ctaTargetTestimonials') },
    { value: 'about', label: t('ctaTargetAbout') },
    { value: 'contact', label: t('ctaTargetContact') },
  ];

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="hero-title" className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('titleLabel')}
        </label>
        <input
          id="hero-title"
          type="text"
          value={hero.title}
          placeholder={t('titlePlaceholder')}
          onChange={(event) => update({ title: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="hero-subtitle" className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('subtitleLabel')}
        </label>
        <input
          id="hero-subtitle"
          type="text"
          value={hero.subtitle ?? ''}
          placeholder={t('subtitlePlaceholder')}
          onChange={(event) => update({ subtitle: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="hero-eyebrow" className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('eyebrowLabel')}
        </label>
        <input
          id="hero-eyebrow"
          type="text"
          value={hero.eyebrow ?? ''}
          placeholder={t('eyebrowPlaceholder')}
          onChange={(event) => update({ eyebrow: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <PillSelect
        label={t('variantLabel')}
        value={hero.variant}
        onChange={(variant) => update({ variant })}
        testId="hero-variant"
        options={[
          { value: 'centered', label: t('variantCentered') },
          { value: 'left-aligned', label: t('variantLeftAligned') },
        ]}
      />

      <div>
        <label
          htmlFor="hero-cta-label"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('ctaLabelLabel')}
        </label>
        <input
          id="hero-cta-label"
          type="text"
          value={hero.ctaLabel}
          placeholder={t('ctaLabelPlaceholder')}
          onChange={(event) => update({ ctaLabel: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('ctaTargetLabel')}
        </label>
        <Select
          value={hero.ctaTarget}
          onValueChange={(value) => update({ ctaTarget: value as CtaTarget })}
        >
          <SelectTrigger data-testid="hero-cta-target" aria-label={t('ctaTargetLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ctaTargetOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label
          htmlFor="hero-secondary-cta-label"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('secondaryCtaLabelLabel')}
        </label>
        <input
          id="hero-secondary-cta-label"
          type="text"
          value={hero.secondaryCtaLabel ?? ''}
          placeholder={t('secondaryCtaLabelPlaceholder')}
          onChange={(event) => update({ secondaryCtaLabel: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-gray-900">
          {t('secondaryCtaTargetLabel')}
        </label>
        <Select
          value={hero.secondaryCtaTarget ?? ''}
          onValueChange={(value) =>
            update({ secondaryCtaTarget: value === '' ? undefined : (value as CtaTarget) })
          }
        >
          <SelectTrigger
            data-testid="hero-secondary-cta-target"
            aria-label={t('secondaryCtaTargetLabel')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t('secondaryCtaTargetNone')}</SelectItem>
            {ctaTargetOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PillSelect
        label={t('rightPanelLabel')}
        value={hero.rightPanel ?? 'none'}
        onChange={(rightPanel) => update({ rightPanel })}
        testId="hero-right-panel"
        options={[
          { value: 'none', label: t('rightPanelNone') },
          { value: 'image', label: t('rightPanelImage') },
          { value: 'brand-card', label: t('rightPanelBrandCard') },
        ]}
      />

      <SingleImageUploadField
        id="hero-background-image"
        value={hero.backgroundImageUrl ?? ''}
        onChange={(backgroundImageUrl) => update({ backgroundImageUrl })}
        purpose="hero"
        previewSize="large"
        label={t('backgroundImageLabel')}
        clickToAddLabel={t('backgroundImageClickToAdd')}
        formatHintLabel={t('backgroundImageFormatHint')}
        uploadingLabel={t('backgroundImageUploading')}
        uploadErrorLabel={t('backgroundImageUploadError')}
        removeLabel={t('backgroundImageRemove')}
      />
    </div>
  );
}
