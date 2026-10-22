'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteAdminContentResponse, HotsiteModuleType } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { MOBILE_ACTION_BAR_CLEARANCE_CLASS } from '@/shells/dashboard/utils/mobile-action-bar';
import { HotsiteActionBanner, type ActionBanner } from './HotsiteActionBanner';
import { HotsitePreviewCanvas } from './hotsite-editor-lazy-panels';
import type { VisualContext } from './hotsite-editor-views';
import { buildPreviewDraft } from './hotsite-module-buffer';
import { VisualModuleInspector, type ModuleInspectorActions } from './VisualModuleInspector';

// Branding and style and Sharing arrive with Story 3; until then their real fields are reachable
// through "Edit in detail".
const CONTEXT_COMMANDS = ['branding', 'structure', 'sharing'] as const;
const COMING_SOON_HINT_ID = 'hotsite-visual-coming-soon';
const PUBLISH_BLOCKED_HINT_ID = 'hotsite-visual-publish-blocked';

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
  readonly onShowStructure: () => void;
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
}

function VisualInspector({
  draft,
  visualContext,
  actions,
  onConfigure,
}: InspectorProps): React.JSX.Element {
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
          <VisualModuleInspector
            layout={draft.layout}
            buffer={visualContext.kind === 'module' ? visualContext : null}
            onConfigure={onConfigure}
            {...actions}
          />
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
  onShowStructure,
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

      <fieldset className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white p-3">
        <legend className="sr-only">{t('visual.commandsLabel')}</legend>
        {CONTEXT_COMMANDS.map((command) =>
          command === 'structure' ? (
            <Button
              key={command}
              type="button"
              variant="outline"
              onClick={onShowStructure}
              data-testid="visual-command"
              data-command={command}
            >
              {t(`visual.commands.${command}`)}
            </Button>
          ) : (
            <Button
              key={command}
              type="button"
              variant="outline"
              disabled
              title={t('visual.comingSoon')}
              aria-describedby={COMING_SOON_HINT_ID}
              data-testid="visual-command"
              data-command={command}
            >
              {t(`visual.commands.${command}`)}
            </Button>
          ),
        )}
        <p id={COMING_SOON_HINT_ID} className="sr-only">
          {t('visual.comingSoon')}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={onEditInDetail}
          data-testid="visual-command"
          data-command="detail"
        >
          {t('visual.commands.detail')}
        </Button>
        <div className="hidden items-center gap-2 lg:ml-auto lg:flex">
          <Button asChild variant="outline" data-testid="visual-command" data-command="view-live">
            <a href={liveSiteHref} target="_blank" rel="noopener noreferrer">
              {t('visual.commands.viewLive')}
            </a>
          </Button>
          <Button
            type="button"
            disabled={publishDisabled}
            aria-describedby={publishDescribedBy}
            onClick={onPublish}
            data-testid="visual-command"
            data-command="publish"
          >
            {t('visual.commands.publish')}
          </Button>
        </div>
        {publishBlocked && (
          <p
            id={PUBLISH_BLOCKED_HINT_ID}
            data-testid="visual-publish-hint"
            className="w-full text-sm text-amber-800"
          >
            {t('visual.publishBlockedHint')}
          </p>
        )}
      </fieldset>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <section
          aria-label={t('visual.previewLabel')}
          data-testid="visual-preview"
          className="space-y-2"
        >
          <p data-testid="visual-preview-status" className="text-sm text-gray-500">
            {selectedType
              ? t('visual.previewStatusSelected', { module: t(`layout.modules.${selectedType}`) })
              : t('visual.previewStatusIdle')}
          </p>
          <HotsitePreviewCanvas
            draft={previewDraft}
            selection={{ selectedType, onSelect: onSelectModule }}
          />
        </section>

        <VisualInspector
          draft={draft}
          visualContext={visualContext}
          actions={inspector}
          onConfigure={onSelectModule}
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
