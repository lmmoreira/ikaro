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
import { ConfigTextField } from './ConfigTextField';
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
      <ConfigTextField
        id="hero-title"
        label={t('titleLabel')}
        value={hero.title}
        placeholder={t('titlePlaceholder')}
        onChange={(title) => update({ title })}
      />

      <ConfigTextField
        id="hero-subtitle"
        label={t('subtitleLabel')}
        value={hero.subtitle ?? ''}
        placeholder={t('subtitlePlaceholder')}
        onChange={(subtitle) => update({ subtitle })}
      />

      <ConfigTextField
        id="hero-eyebrow"
        label={t('eyebrowLabel')}
        value={hero.eyebrow ?? ''}
        placeholder={t('eyebrowPlaceholder')}
        onChange={(eyebrow) => update({ eyebrow })}
      />

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

      <PillSelect
        label={t('contentPositionYLabel')}
        value={hero.contentPositionY ?? 'center'}
        onChange={(contentPositionY) => update({ contentPositionY })}
        testId="hero-content-position-y"
        options={[
          { value: 'top', label: t('contentPositionYTop') },
          { value: 'center', label: t('contentPositionYCenter') },
          { value: 'bottom', label: t('contentPositionYBottom') },
        ]}
      />

      {hero.variant === 'centered' && (
        <PillSelect
          label={t('contentPositionXLabel')}
          value={hero.contentPositionX ?? 'center'}
          onChange={(contentPositionX) => update({ contentPositionX })}
          testId="hero-content-position-x"
          options={[
            { value: 'left', label: t('contentPositionXLeft') },
            { value: 'center', label: t('contentPositionXCenter') },
            { value: 'right', label: t('contentPositionXRight') },
          ]}
        />
      )}

      <ConfigTextField
        id="hero-cta-label"
        label={t('ctaLabelLabel')}
        value={hero.ctaLabel}
        placeholder={t('ctaLabelPlaceholder')}
        onChange={(ctaLabel) => update({ ctaLabel })}
      />

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

      <ConfigTextField
        id="hero-secondary-cta-label"
        label={t('secondaryCtaLabelLabel')}
        value={hero.secondaryCtaLabel ?? ''}
        placeholder={t('secondaryCtaLabelPlaceholder')}
        onChange={(secondaryCtaLabel) => update({ secondaryCtaLabel })}
      />

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
        lowResolutionErrorLabel={t('backgroundImageLowResolutionError')}
        removeLabel={t('backgroundImageRemove')}
      />

      {hero.backgroundImageUrl && (
        <PillSelect
          label={t('backgroundImagePositionLabel')}
          value={hero.backgroundImagePosition ?? 'center'}
          onChange={(backgroundImagePosition) => update({ backgroundImagePosition })}
          testId="hero-background-image-position"
          options={[
            { value: 'left', label: t('backgroundImagePositionLeft') },
            { value: 'center', label: t('backgroundImagePositionCenter') },
            { value: 'right', label: t('backgroundImagePositionRight') },
          ]}
        />
      )}
    </div>
  );
}
