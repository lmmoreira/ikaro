'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteTemplateSummaryResponse } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { DiscardChangesDialog } from '@/shared/components/DiscardChangesDialog';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import { cn } from '@/shared/utils/cn';
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
      <output data-testid="template-loading" className="block text-sm text-gray-500">
        {t('loading')}
      </output>
    );
  }
  if (controller.isError || !controller.templates) {
    return (
      <FeedbackMessage
        title={t('error')}
        onRetry={controller.reload}
        retryLabel={t('retry')}
        testId="template-load-error"
      />
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

function GalleryHeader({ headingClassName }: { readonly headingClassName: string }) {
  const t = useTranslations('dashboard.hotsitePage.templates');

  return (
    <div className="space-y-1">
      <h2 id="templates-heading" className={cn('text-gray-900', headingClassName)}>
        {t('heading')}
      </h2>
      <p className="text-sm leading-6 text-gray-600">{t('intro')}</p>
      <p className="text-sm leading-6 text-gray-500">{t('note')}</p>
    </div>
  );
}

// The notices and the undo button that sit between the header and the catalogue.
function GalleryControls({ controller }: HotsiteTemplateGalleryProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.templates');

  return (
    <>
      {controller.showSampleNotice && (
        <output
          data-testid="template-sample-notice"
          className="block rounded-md bg-amber-50 p-3 text-sm text-amber-800"
        >
          {t('sampleNotice')}
        </output>
      )}

      {controller.applyFailed && (
        <FeedbackMessage
          title={t('applyError')}
          onRetry={controller.retryApply}
          retryLabel={t('retry')}
          testId="template-apply-error"
        />
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
    </>
  );
}

function GalleryDialogs({ controller }: HotsiteTemplateGalleryProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.templates');

  return (
    <>
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
    </>
  );
}

// The template picker: six cards applied straight onto the in-memory draft (there is no separate
// preview step — preview and apply are the same operation). The visual editor mounts it in the
// inspector (this component, on the page background like the rest of the inspector); the detailed
// editor mounts HotsiteTemplateGalleryTab. Both read the same session state.
export function HotsiteTemplateGallery({
  controller,
}: HotsiteTemplateGalleryProps): React.JSX.Element {
  return (
    <section
      className="space-y-4"
      data-testid="template-gallery"
      aria-labelledby="templates-heading"
    >
      <GalleryHeader headingClassName="text-base font-semibold" />
      <GalleryControls controller={controller} />
      <CatalogueBody controller={controller} />
      <GalleryDialogs controller={controller} />
    </section>
  );
}

// The detailed editor's templates tab: the heading, intro and controls sit in a card level with
// the action pane's card; the catalogue below is already a grid of cards, so it is not wrapped
// again.
export function HotsiteTemplateGalleryTab({
  controller,
}: HotsiteTemplateGalleryProps): React.JSX.Element {
  return (
    <section
      className="space-y-4 lg:space-y-6"
      data-testid="template-gallery"
      aria-labelledby="templates-heading"
    >
      <Card>
        <CardContent className="space-y-4 p-5 lg:p-6">
          <GalleryHeader headingClassName="text-sm font-semibold" />
          <GalleryControls controller={controller} />
        </CardContent>
      </Card>
      <CatalogueBody controller={controller} />
      <GalleryDialogs controller={controller} />
    </section>
  );
}
