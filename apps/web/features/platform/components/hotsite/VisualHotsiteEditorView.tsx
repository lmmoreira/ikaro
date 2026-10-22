'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type {
  HotsiteAdminContentResponse,
  HotsiteBrandingResponse,
  HotsiteModuleType,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { MOBILE_ACTION_BAR_CLEARANCE_CLASS } from '@/shells/dashboard/utils/mobile-action-bar';
import { BrandingTab } from './BrandingTab';
import { HotsiteActionBanner, type ActionBanner } from './HotsiteActionBanner';
import { HotsiteSharingPreview } from './HotsiteSharingPreview';
import { HotsitePreviewCanvas } from './hotsite-editor-lazy-panels';
import type { VisualContext } from './hotsite-editor-views';
import { buildPreviewDraft } from './hotsite-module-buffer';
import { SeoTab } from './SeoTab';
import {
  PUBLISH_BLOCKED_HINT_ID,
  VisualCommandRow,
  type GlobalContextKind,
} from './VisualCommandRow';
import { VisualModuleInspector, type ModuleInspectorActions } from './VisualModuleInspector';

interface VisualHotsiteEditorViewProps {
  readonly draft: HotsiteAdminContentResponse;
  readonly visualContext: VisualContext;
  readonly actionBanner: ActionBanner | null;
  readonly tenantSlug: string;
  readonly isPublishing: boolean;
  // True while the open module buffer has unapplied edits: Publish would leave them out, so it is
  // disabled until the manager applies or cancels them.
  readonly publishBlocked: boolean;
  readonly inspector: ModuleInspectorActions;
  readonly onSelectModule: (type: HotsiteModuleType) => void;
  readonly onShowContext: (kind: GlobalContextKind) => void;
  readonly onBrandingChange: (branding: HotsiteBrandingResponse) => void;
  readonly onSeoChange: (seo: HotsiteSeoResponse) => void;
  readonly onEditInDetail: () => void;
  readonly onPublish: () => void;
}

// The visual context survives a visual -> detailed -> visual round trip. A module that is no longer
// in the draft's layout cannot stay selected, or the status line and inspector would name a
// section that does not exist. A module that is merely disabled stays selected: it remains
// configurable from the list, it just is not shown in the preview.
function effectiveContext(
  visualContext: VisualContext,
  layout: HotsiteAdminContentResponse['layout'],
): VisualContext {
  if (visualContext.kind !== 'module') return visualContext;
  const inLayout = layout.some((module) => module.type === visualContext.type);
  return inLayout ? visualContext : { kind: 'structure' };
}

interface InspectorProps {
  readonly draft: HotsiteAdminContentResponse;
  readonly visualContext: VisualContext;
  readonly actions: ModuleInspectorActions;
  readonly onConfigure: (type: HotsiteModuleType) => void;
  readonly onBrandingChange: (branding: HotsiteBrandingResponse) => void;
  readonly onSeoChange: (seo: HotsiteSeoResponse) => void;
}

// What the inspector hosts for the current context: the real Branding or SEO fields (the same
// controls the detailed editor's tabs use), or the structure list / the open module's panel.
function InspectorContent({
  draft,
  visualContext,
  actions,
  onConfigure,
  onBrandingChange,
  onSeoChange,
}: InspectorProps): React.JSX.Element {
  if (visualContext.kind === 'branding') {
    return <BrandingTab value={draft.branding} onChange={onBrandingChange} />;
  }
  if (visualContext.kind === 'sharing') {
    return <SeoTab value={draft.seo} onChange={onSeoChange} />;
  }
  return (
    <VisualModuleInspector
      layout={draft.layout}
      buffer={visualContext.kind === 'module' ? visualContext : null}
      onConfigure={onConfigure}
      {...actions}
    />
  );
}

function VisualInspector(props: InspectorProps): React.JSX.Element {
  const { visualContext } = props;
  const t = useTranslations('dashboard.hotsitePage');
  const inspectorRef = useRef<HTMLElement>(null);
  const contextKey = visualContext.kind === 'module' ? visualContext.type : visualContext.kind;

  // A new selection starts the inspector at its beginning. Only the inspector's own scroll is
  // reset — never the window, so picking a lower preview section does not jump the page.
  useEffect(() => {
    if (inspectorRef.current) inspectorRef.current.scrollTop = 0;
  }, [contextKey]);

  return (
    <aside
      ref={inspectorRef}
      aria-label={t('visual.inspectorLabel')}
      data-testid="visual-inspector"
      className="lg:sticky lg:top-[4.25rem] lg:max-h-[calc(100vh-5.25rem)] lg:overflow-y-auto"
    >
      <Card>
        <CardContent className="p-4">
          <InspectorContent {...props} />
        </CardContent>
      </Card>
    </aside>
  );
}

// The default manager view: the in-memory draft as a persistent page preview, compact editor
// commands above it, and a contextual inspector beside it (below it on narrow screens). It owns no
// draft or navigation state — HotsiteEditor passes both in.
export function VisualHotsiteEditorView({
  draft,
  visualContext: requestedContext,
  actionBanner,
  tenantSlug,
  isPublishing,
  publishBlocked,
  inspector,
  onSelectModule,
  onShowContext,
  onBrandingChange,
  onSeoChange,
  onEditInDetail,
  onPublish,
}: VisualHotsiteEditorViewProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');
  const visualContext = effectiveContext(requestedContext, draft.layout);
  const selectedType = visualContext.kind === 'module' ? visualContext.type : null;
  const liveSiteHref = `/${tenantSlug}`;
  const publishDisabled = isPublishing || publishBlocked;
  const publishDescribedBy = publishBlocked ? PUBLISH_BLOCKED_HINT_ID : undefined;
  // The open module's edits show live in the preview before they are applied.
  const previewDraft = buildPreviewDraft(
    draft,
    visualContext.kind === 'module' ? visualContext : null,
  );

  return (
    <div data-testid="visual-editor" className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div data-testid="visual-banner-slot">
        <HotsiteActionBanner banner={actionBanner} tenantSlug={tenantSlug} />
      </div>

      <VisualCommandRow
        activeContext={visualContext.kind === 'module' ? null : visualContext.kind}
        liveSiteHref={liveSiteHref}
        publishDisabled={publishDisabled}
        publishBlocked={publishBlocked}
        onShowContext={onShowContext}
        onEditInDetail={onEditInDetail}
        onPublish={onPublish}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <section
          aria-label={t('visual.previewLabel')}
          data-testid="visual-preview"
          className="space-y-2"
        >
          {visualContext.kind === 'sharing' ? (
            <HotsiteSharingPreview seo={draft.seo} tenantSlug={tenantSlug} />
          ) : (
            <>
              <p
                role="status"
                data-testid="visual-preview-status"
                className="text-sm text-gray-500"
              >
                {selectedType
                  ? t('visual.previewStatusSelected', {
                      module: t(`layout.modules.${selectedType}`),
                    })
                  : t('visual.previewStatusIdle')}
              </p>
              <HotsitePreviewCanvas
                draft={previewDraft}
                selection={{ selectedType, onSelect: onSelectModule }}
              />
            </>
          )}
        </section>

        <VisualInspector
          draft={draft}
          visualContext={visualContext}
          actions={inspector}
          onConfigure={onSelectModule}
          onBrandingChange={onBrandingChange}
          onSeoChange={onSeoChange}
        />
      </div>

      <div
        className={`fixed inset-x-0 ${MOBILE_ACTION_BAR_CLEARANCE_CLASS} z-20 flex gap-3 border-t border-gray-200 bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden`}
      >
        <Button asChild variant="outline" className="flex-1" data-testid="visual-view-live-mobile">
          <a href={liveSiteHref} target="_blank" rel="noopener noreferrer">
            {t('visual.commands.viewLive')}
          </a>
        </Button>
        <Button
          type="button"
          disabled={publishDisabled}
          aria-describedby={publishDescribedBy}
          onClick={onPublish}
          className="flex-1"
          data-testid="visual-publish-mobile"
        >
          {t('visual.commands.publish')}
        </Button>
      </div>
    </div>
  );
}
