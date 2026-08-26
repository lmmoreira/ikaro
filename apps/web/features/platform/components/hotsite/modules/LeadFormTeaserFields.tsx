'use client';

import { useTranslations } from 'next-intl';

export type LeadFormTeaserDraft = {
  title: string;
  subtitle?: string;
  ctaLabel: string;
  variant?: 'centered' | 'left-aligned';
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
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-base font-semibold text-gray-900">{t('teaser.title')}</h2>
      <label className="block text-sm font-semibold">
        {t('teaser.titleLabel')}
        <input
          value={draft.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm font-semibold">
        {t('teaser.subtitleLabel')}
        <textarea
          value={draft.subtitle ?? ''}
          onChange={(event) => onChange({ subtitle: event.target.value })}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm font-semibold">
        {t('teaser.ctaLabel')}
        <input
          value={draft.ctaLabel}
          onChange={(event) => onChange({ ctaLabel: event.target.value })}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm font-semibold">
        {t('teaser.variantLabel')}
        <select
          value={draft.variant ?? 'centered'}
          onChange={(event) =>
            onChange({ variant: event.target.value as LeadFormTeaserDraft['variant'] })
          }
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="centered">{t('teaser.variantCentered')}</option>
          <option value="left-aligned">{t('teaser.variantLeftAligned')}</option>
        </select>
      </label>
      <label className="block text-sm font-semibold">
        {t('teaser.bgStyleLabel')}
        <select
          value={draft.bgStyle ?? 'background'}
          onChange={(event) =>
            onChange({ bgStyle: event.target.value as LeadFormTeaserDraft['bgStyle'] })
          }
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="primary">{t('teaser.bgStylePrimary')}</option>
          <option value="background">{t('teaser.bgStyleBackground')}</option>
        </select>
      </label>
    </div>
  );
}
