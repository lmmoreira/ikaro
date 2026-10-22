'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteAdminContentResponse, HotsiteModuleType } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { DiscardChangesDialog } from '@/shared/components/DiscardChangesDialog';
import { LayoutTab } from './LayoutTab';
import { MODULE_CONFIG_PANELS } from './hotsite-editor-lazy-panels';
import type { ModuleBuffer } from './hotsite-module-buffer';

interface VisualModuleInspectorProps {
  readonly layout: HotsiteAdminContentResponse['layout'];
  // The open module's local edit buffer; null shows the Organize modules list instead.
  readonly buffer: ModuleBuffer | null;
  readonly discardConfirmOpen: boolean;
  readonly onLayoutChange: (layout: HotsiteAdminContentResponse['layout']) => void;
  readonly onConfigure: (type: HotsiteModuleType) => void;
  readonly onBufferChange: (localData: Record<string, unknown>) => void;
  readonly onApply: () => void;
  readonly onLeaveModule: () => void;
  readonly onConfirmDiscard: () => void;
  readonly onKeepEditing: () => void;
}

// Everything the inspector needs beyond the draft's layout and the open buffer.
export type ModuleInspectorActions = Pick<
  VisualModuleInspectorProps,
  | 'discardConfirmOpen'
  | 'onLayoutChange'
  | 'onBufferChange'
  | 'onApply'
  | 'onLeaveModule'
  | 'onConfirmDiscard'
  | 'onKeepEditing'
>;

// The visual editor's inspector body: the Organize modules list, or — once a module is opened —
// that module's real configuration panel with Apply / Cancel. The panel edits only `buffer`; the
// shared draft changes on Apply, exactly like the detailed editor's "Configurar" screen.
export function VisualModuleInspector({
  layout,
  buffer,
  discardConfirmOpen,
  onLayoutChange,
  onConfigure,
  onBufferChange,
  onApply,
  onLeaveModule,
  onConfirmDiscard,
  onKeepEditing,
}: VisualModuleInspectorProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');
  const tShell = useTranslations('dashboard.hotsitePage.layout.configShell');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openType = buffer?.type ?? null;

  // Opening a module moves focus to its heading, so a keyboard or screen-reader user lands on the
  // new context instead of on the (now removed) Configure button. The page itself never scrolls.
  useEffect(() => {
    if (openType) headingRef.current?.focus({ preventScroll: true });
  }, [openType]);

  if (!buffer) {
    return (
      <div className="space-y-3" data-testid="visual-structure">
        <h2 className="text-base font-semibold text-gray-900">{t('visual.structureTitle')}</h2>
        <p className="text-sm leading-6 text-gray-500">{t('visual.emptyHint')}</p>
        <LayoutTab layout={layout} onChange={onLayoutChange} onConfigure={onConfigure} />
      </div>
    );
  }

  const Panel = MODULE_CONFIG_PANELS[buffer.type];
  const moduleEnabled = layout.some((module) => module.type === buffer.type && module.enabled);

  return (
    <div className="space-y-4" data-testid="visual-module-inspector">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onLeaveModule}
        data-testid="visual-inspector-back"
      >
        ← {t('visual.backToStructure')}
      </Button>
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-base font-semibold text-gray-900 focus:outline-none"
      >
        {t(`layout.modules.${buffer.type}`)}
      </h2>
      {!moduleEnabled && (
        <p
          data-testid="visual-inspector-disabled-note"
          className="rounded-md bg-amber-50 p-3 text-sm text-amber-800"
        >
          {t('visual.moduleDisabledNote')}
        </p>
      )}
      <Panel key={buffer.type} data={buffer.localData} onChange={onBufferChange} />
      <div className="flex gap-3">
        <Button
          type="button"
          className="flex-1"
          onClick={onApply}
          data-testid="visual-inspector-apply"
        >
          {tShell('applyLabel')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onLeaveModule}
          data-testid="visual-inspector-cancel"
        >
          {tShell('cancelLabel')}
        </Button>
      </div>
      <DiscardChangesDialog
        open={discardConfirmOpen}
        title={tShell('discardConfirmTitle')}
        description={tShell('discardConfirmDescription')}
        keepEditingLabel={tShell('discardConfirmKeepEditing')}
        discardLabel={tShell('discardConfirmDiscardButton')}
        onConfirmDiscard={onConfirmDiscard}
        onCancel={onKeepEditing}
        confirmTestId="visual-module-discard-confirm"
      />
    </div>
  );
}
