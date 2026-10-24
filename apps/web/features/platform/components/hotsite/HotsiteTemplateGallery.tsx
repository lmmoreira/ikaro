'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteTemplateSummaryResponse } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { DiscardChangesDialog } from '@/shared/components/DiscardChangesDialog';
import { ApplyTemplateDialog } from './ApplyTemplateDialog';
import {
  MAX_CAPABILITY_CHIPS,
  TEMPLATE_CAPABILITY_LABEL_KEY,
} from './hotsite-template-application';
import type { HotsiteTemplatesController } from './useHotsiteTemplateApplication';

interface TemplateCardProps {
  readonly template: HotsiteTemplateSummaryResponse;
  readonly controller: HotsiteTemplatesController;
}

function TemplateCard({ template, controller }: TemplateCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.templates');
  const selected = controller.appliedTemplateId === template.id;
  const busy = controller.applyingTemplateId === template.id;
  const name = t(`${template.id}.name`);

  return (
    <li
      data-testid="template-card"
      data-template-id={template.id}
      data-selected={selected}
      aria-current={selected ? 'true' : undefined}
    >
      <Card className={selected ? 'border-blue-600 ring-1 ring-blue-600' : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a public catalogue thumbnail, resolved server-side */}
        <img
          src={template.thumbnailUrl}
          alt={t('thumbnailAlt', { name })}
          loading="lazy"
          className="aspect-[16/10] w-full rounded-t-lg object-cover"
        />
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900">{name}</h3>
            {selected && (
              <Badge data-testid="template-selected-badge" className="shrink-0">
                {t('selected')}
              </Badge>
            )}
          </div>
          <p className="text-sm leading-6 text-gray-600">{t(`${template.id}.description`)}</p>
          <ul className="flex flex-wrap gap-1.5" aria-label={name}>
            {template.capabilities.slice(0, MAX_CAPABILITY_CHIPS).map((capability) => (
              <li key={capability}>
                <Badge variant="secondary" data-testid="template-capability">
                  {t(TEMPLATE_CAPABILITY_LABEL_KEY[capability])}
                </Badge>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant={selected ? 'secondary' : 'default'}
            className="w-full"
            disabled={controller.isApplying}
            aria-busy={busy}
            onClick={() => controller.apply(template.id)}
            data-testid="template-apply"
          >
            {busy ? t('applying') : t('use')}
          </Button>
        </CardContent>
      </Card>
    </li>
  );
}

function CatalogueBody({
  controller,
}: {
  readonly controller: HotsiteTemplatesController;
}): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.templates');

  if (controller.isLoading) {
    return (
      <p role="status" data-testid="template-loading" className="text-sm text-gray-500">
        {t('loading')}
      </p>
    );
  }
  if (controller.isError || !controller.templates) {
    return (
      <div
        role="alert"
        data-testid="template-load-error"
        className="space-y-2 rounded-md bg-red-50 p-3 text-sm text-red-800"
      >
        <p>{t('error')}</p>
        <Button type="button" variant="outline" size="sm" onClick={controller.reload}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  return (
    <ul
      aria-label={t('listLabel')}
      className="grid gap-4 sm:grid-cols-2"
      data-testid="template-list"
    >
      {controller.templates.map((template) => (
        <TemplateCard key={template.id} template={template} controller={controller} />
      ))}
    </ul>
  );
}

interface HotsiteTemplateGalleryProps {
  readonly controller: HotsiteTemplatesController;
}

// The template picker: six cards applied straight onto the in-memory draft (there is no separate
// preview step — preview and apply are the same operation). The visual editor mounts it in the
// inspector and the detailed editor in its first tab; both read the same session state.
export function HotsiteTemplateGallery({
  controller,
}: HotsiteTemplateGalleryProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.templates');

  return (
    <section
      className="space-y-4"
      data-testid="template-gallery"
      aria-labelledby="templates-heading"
    >
      <div className="space-y-1">
        <h2 id="templates-heading" className="text-base font-semibold text-gray-900">
          {t('heading')}
        </h2>
        <p className="text-sm leading-6 text-gray-600">{t('intro')}</p>
        <p className="text-sm leading-6 text-gray-500">{t('note')}</p>
      </div>

      {controller.showSampleNotice && (
        <p
          role="status"
          data-testid="template-sample-notice"
          className="rounded-md bg-amber-50 p-3 text-sm text-amber-800"
        >
          {t('sampleNotice')}
        </p>
      )}

      {controller.applyFailed && (
        <div
          role="alert"
          data-testid="template-apply-error"
          className="space-y-2 rounded-md bg-red-50 p-3 text-sm text-red-800"
        >
          <p>{t('applyError')}</p>
          <Button type="button" variant="outline" size="sm" onClick={controller.retryApply}>
            {t('retry')}
          </Button>
        </div>
      )}

      {controller.canUndo && (
        <Button
          type="button"
          variant="outline"
          disabled={controller.isApplying}
          onClick={controller.undo}
          data-testid="template-undo"
        >
          {t('undo')}
        </Button>
      )}

      <CatalogueBody controller={controller} />

      <ApplyTemplateDialog
        open={controller.replaceConfirmOpen}
        onConfirm={controller.confirmReplace}
        onCancel={controller.cancelReplace}
      />
      <DiscardChangesDialog
        open={controller.undoConfirmOpen}
        title={t('undoConfirm.title')}
        description={t('undoConfirm.description')}
        keepEditingLabel={t('undoConfirm.keep')}
        discardLabel={t('undoConfirm.confirm')}
        onConfirmDiscard={controller.confirmUndo}
        onCancel={controller.cancelUndo}
        confirmTestId="template-undo-confirm"
      />
    </section>
  );
}
