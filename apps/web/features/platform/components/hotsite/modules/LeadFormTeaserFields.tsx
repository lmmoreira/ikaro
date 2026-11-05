'use client';

import { useTranslations } from 'next-intl';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SingleImageUploadField } from '../SingleImageUploadField';
import { ConfigTextField } from './ConfigTextField';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';

export type LeadFormTeaserDraft = {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  ctaLabel: string;
  variant?: 'centered' | 'left-aligned' | 'immersive';
  backgroundImageUrl?: string | null;
  backgroundImagePosition?: 'left' | 'center' | 'right';
  bgStyle?: 'primary' | 'background';
};

type LeadFormTeaserFieldsProps = {
  readonly draft: LeadFormTeaserDraft;
  readonly onChange: (patch: Partial<LeadFormTeaserDraft>) => void;
};

export function LeadFormTeaserFields({
  draft,
  onChange,
}: LeadFormTeaserFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.leadForm');

  return (
    <div className="space-y-5">
      <ConfigTextField
        id="lead-form-teaser-title"
        label={t('teaser.titleLabel')}
        value={draft.title}
        onChange={(title) => onChange({ title })}
      />
      <div>
        <Label htmlFor="lead-form-teaser-subtitle">{t('teaser.subtitleLabel')}</Label>
        <Textarea
          id="lead-form-teaser-subtitle"
          value={draft.subtitle ?? ''}
          onChange={(event) => onChange({ subtitle: event.target.value })}
        />
      </div>
      <ConfigTextField
        id="lead-form-teaser-cta"
        label={t('teaser.ctaLabel')}
        value={draft.ctaLabel}
        onChange={(ctaLabel) => onChange({ ctaLabel })}
      />
      <ConfigTextField
        id="lead-form-teaser-eyebrow"
        label={t('teaser.eyebrowLabel')}
        placeholder={t('teaser.eyebrowPlaceholder')}
        value={draft.eyebrow ?? ''}
        onChange={(eyebrow) => onChange({ eyebrow })}
      />
      <PillSelect
        label={t('teaser.variantLabel')}
        value={draft.variant ?? 'centered'}
        onChange={(variant) => onChange({ variant })}
        testId="lead-form-teaser-variant"
        options={[
          { value: 'centered', label: t('teaser.variantCentered') },
          { value: 'left-aligned', label: t('teaser.variantLeftAligned') },
          { value: 'immersive', label: t('teaser.variantImmersive') },
        ]}
      />
      <PillSelect
        label={t('teaser.bgStyleLabel')}
        value={draft.bgStyle ?? 'background'}
        onChange={(bgStyle) => onChange({ bgStyle })}
        testId="lead-form-teaser-bg-style"
        options={[
          { value: 'primary', label: t('teaser.bgStylePrimary') },
          { value: 'background', label: t('teaser.bgStyleBackground') },
        ]}
      />
      <SingleImageUploadField
        id="lead-form-teaser-background-image"
        value={draft.backgroundImageUrl ?? ''}
        onChange={(backgroundImageUrl) => onChange({ backgroundImageUrl })}
        purpose="lead-form"
        previewSize="large"
        label={t('teaser.backgroundImageLabel')}
        clickToAddLabel={t('teaser.backgroundImageClickToAdd')}
        formatHintLabel={t('teaser.backgroundImageFormatHint')}
        uploadingLabel={t('teaser.backgroundImageUploading')}
        uploadErrorLabel={t('teaser.backgroundImageUploadError')}
        lowResolutionErrorLabel={t('teaser.backgroundImageLowResolutionError')}
        removeLabel={t('teaser.backgroundImageRemove')}
      />
      {draft.backgroundImageUrl && (
        <PillSelect
          label={t('teaser.backgroundImagePositionLabel')}
          value={draft.backgroundImagePosition ?? 'center'}
          onChange={(backgroundImagePosition) => onChange({ backgroundImagePosition })}
          testId="lead-form-teaser-background-image-position"
          options={[
            { value: 'left', label: t('teaser.backgroundImagePositionLeft') },
            { value: 'center', label: t('teaser.backgroundImagePositionCenter') },
            { value: 'right', label: t('teaser.backgroundImagePositionRight') },
          ]}
        />
      )}
    </div>
  );
}
