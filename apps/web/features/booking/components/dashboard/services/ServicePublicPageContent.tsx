'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SERVICE_PUBLIC_PROFILE_LIMITS } from '@ikaro/types';
import { RestrictedMarkdown } from '@/shells/hotsite/components/RestrictedMarkdown';
import { SectionCard } from '@/shared/components/ui/section-card';
import { Textarea } from '@/shared/components/ui/textarea';

interface ServicePublicPageContentProps {
  readonly longDescription: string;
  readonly inclusions: readonly string[];
  readonly preparationNotes: string;
  readonly onLongDescriptionChange: (value: string) => void;
  readonly onInclusionsChange: (items: string[]) => void;
  readonly onPreparationNotesChange: (value: string) => void;
}

const LIMITS = SERVICE_PUBLIC_PROFILE_LIMITS;
const FIELD_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

type DescriptionMode = 'write' | 'preview';

// The text of a service's public page: a long description in restricted Markdown (with a preview
// rendered by the same component the visitor's page uses, so the manager sees what they get), the
// list of what is included, and how to prepare. Blank inclusion rows are dropped on save.
export function ServicePublicPageContent({
  longDescription,
  inclusions,
  preparationNotes,
  onLongDescriptionChange,
  onInclusionsChange,
  onPreparationNotesChange,
}: ServicePublicPageContentProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const [mode, setMode] = useState<DescriptionMode>('write');

  return (
    <SectionCard title={t('publicPageDescriptionLabel')}>
      <div>
        <div
          className="mb-2 flex gap-1"
          role="tablist"
          aria-label={t('publicPageDescriptionLabel')}
        >
          {(['write', 'preview'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              data-testid="public-page-description-tab"
              data-mode={value}
              onClick={() => setMode(value)}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${
                mode === value
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {value === 'write'
                ? t('publicPageDescriptionWrite')
                : t('publicPageDescriptionPreview')}
            </button>
          ))}
        </div>

        {mode === 'write' ? (
          <Textarea
            id="service-page-description"
            data-testid="public-page-description"
            aria-label={t('publicPageDescriptionLabel')}
            rows={7}
            maxLength={LIMITS.longDescription}
            value={longDescription}
            onChange={(event) => onLongDescriptionChange(event.target.value)}
          />
        ) : (
          <div
            data-testid="public-page-description-rendered"
            className="min-h-[8rem] rounded-md border border-gray-200 bg-white px-4 py-3"
          >
            {longDescription.trim() === '' ? (
              <p className="text-sm text-gray-400">{t('publicPageDescriptionPreviewEmpty')}</p>
            ) : (
              <RestrictedMarkdown>{longDescription}</RestrictedMarkdown>
            )}
          </div>
        )}
        <p className="mt-1.5 text-sm text-gray-500">{t('publicPageDescriptionHint')}</p>
        <p className="mt-1 text-right text-xs text-gray-500">
          {t('publicPageCounter', { count: longDescription.length, max: LIMITS.longDescription })}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold text-gray-900">
          {t('publicPageInclusionsLabel')}{' '}
          <span className="font-normal text-gray-500" data-testid="public-page-inclusions-count">
            ({t('publicPageInclusionsCount', { count: inclusions.length, max: LIMITS.inclusions })})
          </span>
        </p>
        <ul className="space-y-2">
          {inclusions.map((item, index) => (
            <li key={index} className="flex gap-2">
              <input
                type="text"
                data-testid="public-page-inclusion"
                aria-label={t('publicPageInclusionItemLabel', { index: index + 1 })}
                maxLength={LIMITS.inclusionLength}
                placeholder={t('publicPageInclusionPlaceholder')}
                value={item}
                onChange={(event) =>
                  onInclusionsChange(
                    inclusions.map((current, slot) =>
                      slot === index ? event.target.value : current,
                    ),
                  )
                }
                className={FIELD_CLASS}
              />
              <button
                type="button"
                data-testid="public-page-inclusion-remove"
                aria-label={t('publicPageInclusionRemove')}
                onClick={() => onInclusionsChange(inclusions.filter((_, slot) => slot !== index))}
                className="shrink-0 rounded-md border border-gray-200 px-3 text-gray-500 hover:bg-gray-50"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          data-testid="public-page-inclusion-add"
          disabled={inclusions.length >= LIMITS.inclusions}
          onClick={() => onInclusionsChange([...inclusions, ''])}
          className="mt-2 rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
        >
          {t('publicPageInclusionAdd')}
        </button>
      </div>

      <div>
        <label
          htmlFor="service-page-preparation"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('publicPagePreparationLabel')}
        </label>
        <Textarea
          id="service-page-preparation"
          data-testid="public-page-preparation"
          rows={3}
          maxLength={LIMITS.preparationNotes}
          value={preparationNotes}
          onChange={(event) => onPreparationNotesChange(event.target.value)}
        />
        <p className="mt-1 text-right text-xs text-gray-500">
          {t('publicPageCounter', { count: preparationNotes.length, max: LIMITS.preparationNotes })}
        </p>
      </div>
    </SectionCard>
  );
}
