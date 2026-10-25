'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import type { VisualContext } from './hotsite-editor-views';

export type GlobalContextKind = Exclude<VisualContext, { kind: 'module' }>['kind'];

const CONTEXT_COMMANDS: readonly GlobalContextKind[] = [
  'templates',
  'branding',
  'structure',
  'sharing',
];
const PUBLISH_BLOCKED_HINT_ID = 'hotsite-visual-publish-blocked';

interface VisualCommandRowProps {
  // The global context on screen, or null while a module is open (no global command is current).
  readonly activeContext: GlobalContextKind | null;
  readonly liveSiteHref: string;
  readonly publishDisabled: boolean;
  // True while the open module buffer has unapplied edits: Publish would leave them out.
  readonly publishBlocked: boolean;
  readonly onShowContext: (kind: GlobalContextKind) => void;
  readonly onEditInDetail: () => void;
  readonly onPublish: () => void;
}

// The compact command row above the preview: the four global contexts, Edit in detail, and the
// publish actions (View site / Publish — mirrored in a fixed bar on narrow screens by the view).
export function VisualCommandRow({
  activeContext,
  liveSiteHref,
  publishDisabled,
  publishBlocked,
  onShowContext,
  onEditInDetail,
  onPublish,
}: VisualCommandRowProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');

  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-white p-3">
      <legend className="sr-only">{t('visual.commandsLabel')}</legend>
      {CONTEXT_COMMANDS.map((command) => (
        <Button
          key={command}
          type="button"
          variant={activeContext === command ? 'secondary' : 'outline'}
          aria-pressed={activeContext === command}
          onClick={() => onShowContext(command)}
          data-testid="visual-command"
          data-command={command}
        >
          {t(`visual.commands.${command}`)}
        </Button>
      ))}
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
          aria-describedby={publishBlocked ? PUBLISH_BLOCKED_HINT_ID : undefined}
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
  );
}

export { PUBLISH_BLOCKED_HINT_ID };
