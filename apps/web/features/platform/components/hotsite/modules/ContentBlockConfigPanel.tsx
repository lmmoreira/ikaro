'use client';

import { useTranslations } from 'next-intl';
import {
  ContentBlockModuleDataSchema,
  type ContentBlockCta,
  type ContentBlockCtaTarget,
  type ContentBlockModuleData,
} from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SwitchField } from '@/shared/components/ui/switch-field';
import { RestrictedMarkdown } from '@/shells/hotsite/components/RestrictedMarkdown';
import {
  CONTENT_BLOCK_LIMITS,
  CONTENT_BLOCK_VARIANTS,
  switchContentBlockVariant,
} from '@/features/platform/hotsite/content-block-variants';
import {
  readPresentation,
  splitPresentation,
  withPresentation,
} from '@/features/platform/hotsite/module-presentation';
import { ContentBlockVariantFields } from './ContentBlockVariantFields';
import { SectionPresentationFields } from './SectionPresentationFields';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

const DEFAULT = 'default';
type Align = NonNullable<ContentBlockModuleData['align']>;

const CTA_TARGETS: readonly ContentBlockCtaTarget[] = [
  'booking-form',
  'service-list',
  'gallery',
  'testimonials',
  'about',
  'contact',
];
const DEFAULT_CTA: ContentBlockCta = { label: '', target: 'booking-form' };

// The one panel for the CONTENT_BLOCK module: a variant switcher over six closed shapes. Only the
// selected variant's fields are shown, and switching keeps the shared ones (title, text, button)
// while dropping what the new variant's strict schema would reject.
export function ContentBlockConfigPanel({
  data,
  onChange,
}: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.contentBlock');
  const { data: moduleData } = splitPresentation(data);
  const block = readModuleData<ContentBlockModuleData>(moduleData);
  const presentation = readPresentation(data);
  const limits = CONTENT_BLOCK_LIMITS;
  const incomplete = !ContentBlockModuleDataSchema.safeParse(moduleData).success;

  // `presentation` rides in the buffer next to the module data (module-presentation.ts), so every
  // write puts it back.
  function emit(next: ContentBlockModuleData): void {
    onChange(withPresentation(writeModuleData(next), presentation));
  }
  // The optional shared fields are removed when emptied; the title stays, even when empty.
  function setCommon(patch: Partial<ContentBlockModuleData>): void {
    const merged = { ...block, ...patch } as ContentBlockModuleData;
    for (const key of ['eyebrow', 'body', 'align', 'cta'] as const) {
      if (merged[key] === '' || merged[key] === undefined) delete merged[key];
    }
    emit(merged);
  }

  return (
    <div className="space-y-5">
      <PillSelect<ContentBlockModuleData['variant']>
        label={t('variantLabel')}
        value={block.variant}
        testId="content-block-variant"
        onChange={(variant) => emit(switchContentBlockVariant(block, variant))}
        options={CONTENT_BLOCK_VARIANTS.map((variant) => ({
          value: variant,
          label: t(`variants.${variant}`),
        }))}
      />

      {incomplete && (
        <p
          role="note"
          data-testid="content-block-incomplete"
          className="rounded-md bg-amber-50 p-3 text-sm text-amber-800"
        >
          {t('incomplete')}
        </p>
      )}

      <div>
        <label
          htmlFor="content-block-eyebrow"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('eyebrowLabel')}
        </label>
        <input
          id="content-block-eyebrow"
          type="text"
          value={block.eyebrow ?? ''}
          maxLength={limits.eyebrow}
          onChange={(event) => setCommon({ eyebrow: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="content-block-title"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('titleLabel')}
        </label>
        <input
          id="content-block-title"
          type="text"
          value={block.title}
          maxLength={limits.title}
          onChange={(event) => emit({ ...block, title: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="content-block-body"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('bodyLabel')}
        </label>
        <textarea
          id="content-block-body"
          value={block.body ?? ''}
          maxLength={limits.body}
          rows={5}
          onChange={(event) => setCommon({ body: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-gray-400">{t('bodyHint')}</p>
        {block.body && (
          <div
            data-testid="content-block-body-preview"
            className="mt-2 rounded-md border border-dashed border-gray-300 p-3"
          >
            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">{t('bodyPreview')}</p>
            <RestrictedMarkdown>{block.body}</RestrictedMarkdown>
          </div>
        )}
      </div>

      <PillSelect<Align | typeof DEFAULT>
        label={t('alignLabel')}
        value={block.align ?? DEFAULT}
        testId="content-block-align"
        onChange={(align) => setCommon({ align: align === DEFAULT ? undefined : align })}
        options={[
          { value: DEFAULT, label: t('alignDefault') },
          { value: 'left', label: t('alignLeft') },
          { value: 'center', label: t('alignCenter') },
          { value: 'right', label: t('alignRight') },
        ]}
      />

      <div className="space-y-4 rounded-md border border-gray-200 p-4">
        <SwitchField
          checked={block.cta !== undefined}
          onChange={(on) => setCommon({ cta: on ? DEFAULT_CTA : undefined })}
          label={t('ctaToggle')}
          testId="content-block-cta-toggle"
        />
        {block.cta && (
          <>
            <div>
              <label
                htmlFor="content-block-cta-label"
                className="mb-1.5 block text-sm font-semibold text-gray-900"
              >
                {t('ctaLabel')}
              </label>
              <input
                id="content-block-cta-label"
                type="text"
                value={block.cta.label}
                maxLength={limits.ctaLabel}
                onChange={(event) =>
                  setCommon({ cta: { ...block.cta!, label: event.target.value } })
                }
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <PillSelect<ContentBlockCtaTarget>
              label={t('ctaTarget')}
              value={block.cta.target}
              testId="content-block-cta-target"
              onChange={(target) => setCommon({ cta: { ...block.cta!, target } })}
              options={CTA_TARGETS.map((target) => ({
                value: target,
                label: t(`ctaTargets.${target}`),
              }))}
            />
          </>
        )}
      </div>

      <ContentBlockVariantFields data={block} onChange={emit} />

      <SectionPresentationFields
        moduleType="CONTENT_BLOCK"
        value={presentation}
        onChange={(next) => onChange(withPresentation(data, next))}
      />
    </div>
  );
}
