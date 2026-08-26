'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  HotsiteAdminContentResponse,
  HotsiteBrandingResponse,
  HotsiteModuleType,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { useTenant } from '@/providers/tenant-provider';
import {
  HotsiteEditorMainView,
  type ActionBanner,
  type EditorTab,
} from '@/features/platform/components/hotsite/HotsiteEditorMainView';
import { materializeLayout } from '@/features/platform/hotsite/default-layout';
import type { ManifestDraft } from '@/features/platform/hotsite/manifest-schema';
import {
  useUpdateHotsiteConfig,
  usePublishHotsite,
  useUpdateLeadFormConfig,
  useUnpublishHotsite,
} from '@/features/platform/hotsite/useHotsite';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useHotsiteEditorTopbarOverride } from '@/features/platform/hotsite/useHotsiteEditorTopbarOverride';
import { HotsitePreview } from './hotsite-editor-lazy-panels';
import {
  extractLeadFormConfig,
  applyModuleConfig,
  cancelModuleConfig,
  configureModule,
  executeUnpublish,
  mergeLocalDataIntoLayout,
  ModuleConfigView,
  updateEditorDraft,
  updateModuleLocalData,
  type EditorView,
  type LeadFormConfigDraft,
} from './hotsite-editor-views';
import { executeHotsitePublish } from './hotsite-editor-publish';

interface HotsiteEditorProps {
  readonly initial: HotsiteAdminContentResponse;
}

export function HotsiteEditor({ initial }: HotsiteEditorProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');
  const locale = useResolvedLocale();
  const [activeTab, setActiveTab] = useState<EditorTab>('branding');
  // useState(initial) only applies on mount — page.tsx renders this once per full page load, so
  // `initial` itself never changes under an already-mounted editor. A save (handlePublish) DOES
  // need to refresh this state afterward, but via an explicit setDraft() call using the mutation's
  // response — not by feeding a new `initial` prop back in — see handlePublish's comment on why.
  const [draft, setDraft] = useState<HotsiteAdminContentResponse>(() => ({
    ...initial,
    layout: materializeLayout(initial.layout),
  }));
  // "Configurar" is a client-side view swap, not a real Next.js route — the drill-down panel
  // fills the screen the same way a route would (via ModuleConfigShell), but `draft` never
  // leaves this component's state, so there's no risk of losing other tabs' unsaved edits and no
  // need to lift state into a layout.tsx/Context. Editing a panel's fields updates only
  // `view.localData` (a local copy); "Aplicar" commits it into `draft.layout` by type, "Cancelar"
  // discards it — draft.layout is only ever touched by handleApply below.
  const [view, setView] = useState<EditorView>({ view: 'tabs' });
  const [actionBanner, setActionBanner] = useState<ActionBanner | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const { tenantId, tenantSlug } = useTenant();
  const updateConfig = useUpdateHotsiteConfig();
  const updateLeadFormConfig = useUpdateLeadFormConfig();
  const publishHotsite = usePublishHotsite();
  const unpublishHotsite = useUnpublishHotsite();
  const isPublishing =
    updateConfig.isPending || updateLeadFormConfig.isPending || publishHotsite.isPending;
  const [leadFormConfigDraft, setLeadFormConfigDraft] = useState<LeadFormConfigDraft | null>(null);
  const topbarStatus = useDashboardTopbarStatus();
  const setOnBackOverride = topbarStatus?.setOnBackOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const setPageTitleOverride = topbarStatus?.setPageTitleOverride;
  // "Configurar" and "Preview" both fill the screen but aren't routes, so the shared dashboard
  // Topbar's pathname-based back-link resolution doesn't apply — push a callback override instead
  // (same pattern BookingDetailPage/ServiceEditPage use for backHrefOverride, just with a
  // function instead of a URL since there's nowhere to navigate to). Keyed on stable primitives,
  // not the whole `view` object, so this doesn't re-run on every keystroke while editing a panel.
  const configuringType = view.view === 'module-config' ? view.type : null;
  const isPreview = view.view === 'preview';
  const moduleConfigPreview = view.view === 'module-config-preview' ? view : null;
  // Stable identities across renders — these are effect dependencies inside
  // useHotsiteEditorTopbarOverride, so a fresh inline function here would re-run that effect
  // (and re-push the topbar override) on every render instead of only when view actually changes.
  const onBackToModuleConfigPreview = useCallback(
    (state: { readonly type: HotsiteModuleType; readonly localData: Record<string, unknown> }) =>
      setView({ view: 'module-config', type: state.type, localData: state.localData }),
    [],
  );
  const onBackToTabs = useCallback(() => setView({ view: 'tabs' }), []);

  useHotsiteEditorTopbarOverride({
    configuringType,
    isPreview,
    moduleConfigPreview,
    onBackToModuleConfigPreview,
    onBackToTabs,
    // Hoisted function declaration below — safe to reference before its textual definition.
    requestCancelConfig,
    t,
    setOnBackOverride,
    setBackLabelOverride,
    setPageTitleOverride,
  });

  const clearBanner = (): void => setActionBanner(null);
  const setBranding = (branding: HotsiteBrandingResponse): void =>
    updateEditorDraft(setDraft, clearBanner, (current) => ({ ...current, branding }));
  const setLayout = (layout: HotsiteAdminContentResponse['layout']): void =>
    updateEditorDraft(setDraft, clearBanner, (current) => ({ ...current, layout }));
  const setSeo = (seo: HotsiteSeoResponse): void =>
    updateEditorDraft(setDraft, clearBanner, (current) => ({ ...current, seo }));
  const handleManifestApply = (next: ManifestDraft): void =>
    updateEditorDraft(setDraft, clearBanner, (current) => ({ ...current, ...next }));

  const handlePublish = (
    contentOverride?: HotsiteAdminContentResponse,
    leadFormOverride?: LeadFormConfigDraft,
  ): Promise<void> =>
    executeHotsitePublish({
      content: contentOverride ?? draft,
      leadFormConfig: leadFormOverride ?? leadFormConfigDraft,
      tenantId,
      locale,
      updateConfig,
      updateLeadFormConfig,
      publishHotsite,
      setDraft,
      onTabs: () => setView({ view: 'tabs' }),
      onBanner: setActionBanner,
    });

  const handleUnpublish = (): Promise<void> =>
    executeUnpublish(
      unpublishHotsite,
      locale,
      () => setActionBanner({ kind: 'unpublish', status: 'success' }),
      (message) => setActionBanner({ kind: 'unpublish', status: 'error', message }),
    );

  const handleConfigure = (type: HotsiteModuleType): void =>
    configureModule(draft, type, leadFormConfigDraft, setView);

  const handleLocalDataChange = (localData: Record<string, unknown>): void =>
    updateModuleLocalData(setView, localData);

  const handleApply = (): void =>
    applyModuleConfig(
      view,
      setLeadFormConfigDraft,
      (type, data) =>
        setDraft((current) => ({
          ...current,
          layout: mergeLocalDataIntoLayout(current.layout, type, data),
        })),
      () => setActionBanner(null),
      () => setView({ view: 'tabs' }),
    );

  // Only discards immediately when there's nothing to lose. Otherwise opens the discard-confirm
  // dialog instead of navigating away silently — the actual discard happens in
  // handleConfirmDiscardConfig below, once the admin confirms.
  function requestCancelConfig(): void {
    cancelModuleConfig(
      view,
      draft,
      () => setDiscardConfirmOpen(true),
      () => setView({ view: 'tabs' }),
    );
  }

  const handleConfirmDiscardConfig = (): void => {
    setDiscardConfirmOpen(false);
    setView({ view: 'tabs' });
  };
  const handleCancelDiscardConfig = (): void => setDiscardConfirmOpen(false);

  if (view.view === 'module-config') {
    return (
      <ModuleConfigView
        type={view.type}
        localData={view.localData}
        moduleLabel={t(`layout.modules.${view.type}`)}
        onBack={requestCancelConfig}
        onApply={handleApply}
        onPreview={() =>
          setView({ view: 'module-config-preview', type: view.type, localData: view.localData })
        }
        discardConfirmOpen={discardConfirmOpen}
        onConfirmDiscard={handleConfirmDiscardConfig}
        onCancelDiscard={handleCancelDiscardConfig}
        onChange={handleLocalDataChange}
      />
    );
  }

  if (view.view === 'module-config-preview') {
    const previewDraft: HotsiteAdminContentResponse = {
      ...draft,
      layout: mergeLocalDataIntoLayout(draft.layout, view.type, view.localData),
    };
    return (
      <HotsitePreview
        draft={previewDraft}
        onPublish={() =>
          handlePublish(
            previewDraft,
            view.type === 'LEAD_FORM'
              ? (extractLeadFormConfig(view.localData) ?? undefined)
              : undefined,
          )
        }
        isPublishing={isPublishing}
      />
    );
  }

  if (view.view === 'preview') {
    return (
      <HotsitePreview draft={draft} onPublish={() => handlePublish()} isPublishing={isPublishing} />
    );
  }

  return (
    <HotsiteEditorMainView
      draft={draft}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
      actionBanner={actionBanner}
      tenantSlug={tenantSlug}
      isPublishing={isPublishing}
      isUnpublishing={unpublishHotsite.isPending}
      onBrandingChange={setBranding}
      onLayoutChange={setLayout}
      onSeoChange={setSeo}
      onManifestApply={handleManifestApply}
      onConfigureModule={handleConfigure}
      onUnpublish={handleUnpublish}
      onPublish={() => handlePublish()}
      onOpenPreview={() => setView({ view: 'preview' })}
    />
  );
}
