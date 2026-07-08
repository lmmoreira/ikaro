'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteSeoResponse } from '@ikaro/types';
import { SectionCard } from '@/shared/components/ui/section-card';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

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
    <SectionCard title={t('sectionTitle')}>
      <div>
        <label
          htmlFor="hotsite-seo-title"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('titleLabel', { max: SEO_TITLE_MAX_LENGTH })}
        </label>
        <input
          id="hotsite-seo-title"
          data-testid="hotsite-seo-title"
          type="text"
          maxLength={SEO_TITLE_MAX_LENGTH}
          value={value.title ?? ''}
          placeholder={t('titleHint')}
          onChange={(event) => setField('title', event.target.value || null)}
          className={INPUT_CLASS}
        />
      </div>
      <div>
        <label
          htmlFor="hotsite-seo-description"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('descriptionLabel', { max: SEO_DESCRIPTION_MAX_LENGTH })}
        </label>
        <textarea
          id="hotsite-seo-description"
          data-testid="hotsite-seo-description"
          maxLength={SEO_DESCRIPTION_MAX_LENGTH}
          value={value.description ?? ''}
          placeholder={t('descriptionHint')}
          onChange={(event) => setField('description', event.target.value || null)}
          className={`${INPUT_CLASS} min-h-[6rem] resize-y`}
        />
      </div>
    </SectionCard>
  );
}
