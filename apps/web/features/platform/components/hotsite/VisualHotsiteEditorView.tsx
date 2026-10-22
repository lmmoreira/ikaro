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

// Branding and style, Organize modules and Sharing arrive with Stories 2 and 3; until then their
// real fields are reachable through "Edit in detail".
const PENDING_CONTEXT_COMMANDS = ['branding', 'structure', 'sharing'] as const;
const COMING_SOON_HINT_ID = 'hotsite-visual-coming-soon';

interface VisualHotsiteEditorViewProps {
  readonly draft: HotsiteAdminContentResponse;
  readonly visualContext: VisualContext;
  readonly actionBanner: ActionBanner | null;
  readonly tenantSlug: string;
  readonly isPublishing: boolean;
  readonly onSelectModule: (type: HotsiteModuleType) => void;
  readonly onEditInDetail: () => void;
  readonly onPublish: () => void;
}

// The visual context survives a visual -> detailed -> visual round trip, and the manager can
// disable the selected module in between. A module the preview no longer renders cannot stay
// selected, or the status line and inspector would name a section that is not on the page.
function effectiveContext(
  visualContext: VisualContext,
  layout: HotsiteAdminContentResponse['layout'],
): VisualContext {
  if (visualContext.kind !== 'module') return visualContext;
  const stillRendered = layout.some(
    (module) => module.type === visualContext.type && module.enabled,
  );
  return stillRendered ? visualContext : { kind: 'structure' };
}

interface InspectorProps {
  readonly visualContext: VisualContext;
  readonly onEditInDetail: () => void;
}

function VisualInspector({ visualContext, onEditInDetail }: InspectorProps): React.JSX.Element {
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
        <CardContent aria-live="polite" className="space-y-3 p-4">
          {visualContext.kind === 'module' ? (
            <>
              <h2 className="text-base font-semibold text-gray-900">
                {t(`layout.modules.${visualContext.type}`)}
              </h2>
              <p className="text-sm leading-6 text-gray-500">{t('visual.moduleHint')}</p>
              <Button
                type="button"
                variant="outline"
                onClick={onEditInDetail}
                data-testid="visual-inspector-edit-in-detail"
              >
                {t('visual.commands.detail')}
              </Button>
            </>
          ) : (
            <p className="text-sm leading-6 text-gray-500">{t('visual.emptyHint')}</p>
          )}
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
  onSelectModule,
  onEditInDetail,
  onPublish,
}: VisualHotsiteEditorViewProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');
  const visualContext = effectiveContext(requestedContext, draft.layout);
  const selectedType = visualContext.kind === 'module' ? visualContext.type : null;
  const liveSiteHref = `/${tenantSlug}`;

  return (
    <div data-testid="visual-editor" className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div data-testid="visual-banner-slot">
        <HotsiteActionBanner banner={actionBanner} tenantSlug={tenantSlug} />
      </div>

      <fieldset className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white p-3">
        <legend className="sr-only">{t('visual.commandsLabel')}</legend>
        {PENDING_CONTEXT_COMMANDS.map((command) => (
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
        ))}
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
            disabled={isPublishing}
            onClick={onPublish}
            data-testid="visual-command"
            data-command="publish"
          >
            {t('visual.commands.publish')}
          </Button>
        </div>
      </fieldset>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
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
            draft={draft}
            selection={{ selectedType, onSelect: onSelectModule }}
          />
        </section>

        <VisualInspector visualContext={visualContext} onEditInDetail={onEditInDetail} />
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
          disabled={isPublishing}
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
