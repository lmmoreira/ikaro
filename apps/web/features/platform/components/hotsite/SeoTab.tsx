'use client';

import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { useTranslations } from 'next-intl';
import type { HotsiteSeoResponse } from '@ikaro/types';
import { SectionCard } from '@/shared/components/ui/section-card';
import { OgImageUpload } from './OgImageUpload';

// Real-world Google truncation points, not arbitrary round numbers — matches the domain-level
// SeoTitle/SeoDescription value objects (apps/backend/src/shared/value-objects/).
const SEO_TITLE_MAX_LENGTH = 60;
const SEO_DESCRIPTION_MAX_LENGTH = 158;

interface SeoTabProps {
  readonly value: HotsiteSeoResponse;
  readonly onChange: (seo: HotsiteSeoResponse) => void;
}

export function SeoTab({ value, onChange }: SeoTabProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.seo');

  function setField<K extends keyof HotsiteSeoResponse>(
    key: K,
    fieldValue: HotsiteSeoResponse[K],
  ): void {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <SectionCard title={t('sectionTitle')} size="compact">
      <div>
        <Label htmlFor="hotsite-seo-title">{t('titleLabel', { max: SEO_TITLE_MAX_LENGTH })}</Label>
        <Input
          id="hotsite-seo-title"
          data-testid="hotsite-seo-title"
          type="text"
          maxLength={SEO_TITLE_MAX_LENGTH}
          value={value.title ?? ''}
          placeholder={t('titleHint')}
          onChange={(event) => setField('title', event.target.value || null)}
        />
      </div>
      <div>
        <Label htmlFor="hotsite-seo-description">
          {t('descriptionLabel', { max: SEO_DESCRIPTION_MAX_LENGTH })}
        </Label>
        <Textarea
          id="hotsite-seo-description"
          data-testid="hotsite-seo-description"
          maxLength={SEO_DESCRIPTION_MAX_LENGTH}
          value={value.description ?? ''}
          placeholder={t('descriptionHint')}
          onChange={(event) => setField('description', event.target.value || null)}
          className="min-h-[6rem] resize-y"
        />
      </div>
      <OgImageUpload
        value={value.ogImageUrl}
        onChange={(ogImageUrl) => setField('ogImageUrl', ogImageUrl)}
      />
    </SectionCard>
  );
}
