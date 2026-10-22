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
} from '@/features/platform/components/hotsite/HotsiteEditorMainView';
import { materializeLayout } from '@/features/platform/hotsite/default-layout';
import type { ManifestDraft } from '@/features/platform/hotsite/manifest-schema';
import {
  useLeadFormConfig,
  useUpdateHotsiteConfig,
  usePublishHotsite,
  useUnpublishHotsite,
} from '@/features/platform/hotsite/useHotsite';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useHotsiteEditorTopbarOverride } from '@/features/platform/hotsite/useHotsiteEditorTopbarOverride';
import { HotsitePreview } from './hotsite-editor-lazy-panels';
import { ModuleConfigPreviewScreen } from './ModuleConfigPreviewScreen';
import { VisualHotsiteEditorView } from './VisualHotsiteEditorView';
import { useHotsiteEditorSession } from './useHotsiteEditorSession';
import { useVisualModuleBuffer } from './useVisualModuleBuffer';
import {
  extractLeadFormConfig,
  configureModule,
  executeUnpublish,
  mergeLocalDataIntoLayout,
  ModuleConfigView,
  updateEditorDraft,
  updateModuleLocalData,
  type LeadFormConfigDraft,
} from './hotsite-editor-views';
import { executeHotsitePublish } from './hotsite-editor-publish';
import { applyModuleConfig, cancelModuleConfig } from './hotsite-module-buffer';

interface HotsiteEditorProps {
  readonly initial: HotsiteAdminContentResponse;
}

export function HotsiteEditor({ initial }: HotsiteEditorProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');
  const locale = useResolvedLocale();
  // `mode` is the presentation: the visual editor (default) or the retained tabbed editor behind
  // "Editar em detalhes". Switching never touches `draft`, so edits survive the round trip. `view`
  // only matters in detailed mode — "Configurar" and "Preview" are client-side view swaps, not
  // real Next.js routes: the drill-down panel fills the screen the same way a route would (via
  // ModuleConfigShell), but `draft` never leaves this component's state, so there's no risk of
  // losing other tabs' unsaved edits and no need to lift state into a layout.tsx/Context.
  // Editing a panel's fields updates only `view.localData` (a local copy); "Aplicar" commits it
  // into `draft.layout` by type, "Cancelar" discards it — draft.layout is only ever touched by
  // handleApply below.
  const { mode, view, activeTab, visualContext, setView, setActiveTab, ...navigation } =
    useHotsiteEditorSession();
  // useState(initial) only applies on mount — page.tsx renders this once per full page load, so
  // `initial` itself never changes under an already-mounted editor. A save (handlePublish) DOES
  // need to refresh this state afterward, but via an explicit setDraft() call using the mutation's
  // response — not by feeding a new `initial` prop back in — see handlePublish's comment on why.
  const [draft, setDraft] = useState<HotsiteAdminContentResponse>(() => ({
    ...initial,
    layout: materializeLayout(initial.layout),
  }));
  const [actionBanner, setActionBanner] = useState<ActionBanner | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const { tenantId, tenantSlug } = useTenant();
  const updateConfig = useUpdateHotsiteConfig();
  const publishHotsite = usePublishHotsite();
  const unpublishHotsite = useUnpublishHotsite();
  const isPublishing = updateConfig.isPending || publishHotsite.isPending;
  const [leadFormConfigDraft, setLeadFormConfigDraft] = useState<LeadFormConfigDraft | null>(null);
  const leadFormConfig = useLeadFormConfig();
  // The dirty-check baseline for LEAD_FORM: the same shape LeadFormConfigPanel's own draft
  // converges to once its GET fetch resolves (audienceMode/questions, sans hasSubmissions — a
  // read-only annotation, never something the manager edits). Without this, cancelModuleConfig's
  // committed value (draft.layout[].data alone, which never carries audienceMode/questions — see
  // docs/DOMAIN_MODEL.md § LeadFormConfig "Cross-aggregate save") can never equal the panel's
  // own localData once it syncs, so the discard-confirm dialog showed unconditionally, even with
  // zero real edits (found live, 2026-08-26).
  const leadFormConfigBaseline =
    leadFormConfigDraft ??
    (leadFormConfig.data ? extractLeadFormConfig(leadFormConfig.data) : null);
  const clearBanner = (): void => setActionBanner(null);
  const setLayout = (layout: HotsiteAdminContentResponse['layout']): void =>
    updateEditorDraft(setDraft, clearBanner, (current) => ({ ...current, layout }));
  const commitModuleData = (type: HotsiteModuleType, data: Record<string, unknown>): void =>
    setDraft((current) => ({
      ...current,
      layout: mergeLocalDataIntoLayout(current.layout, type, data),
    }));
  const visualBuffer = useVisualModuleBuffer({
    visualContext,
    draft,
    leadFormConfigBaseline,
    navigation,
    onLayoutChange: setLayout,
    onLeadFormConfig: setLeadFormConfigDraft,
    onCommit: commitModuleData,
    onClearBanner: clearBanner,
  });
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
  const isDetailedTabs = mode === 'detailed' && view.view === 'tabs';
  const moduleConfigPreview = view.view === 'module-config-preview' ? view : null;
  // Stable identities across renders — these are effect dependencies inside
  // useHotsiteEditorTopbarOverride, so a fresh inline function here would re-run that effect
  // (and re-push the topbar override) on every render instead of only when view actually changes.
  const onBackToModuleConfigPreview = useCallback(
    (state: { readonly type: HotsiteModuleType; readonly localData: Record<string, unknown> }) =>
      setView({ view: 'module-config', type: state.type, localData: state.localData }),
    [setView],
  );
  const onBackToTabs = useCallback(() => setView({ view: 'tabs' }), [setView]);

  useHotsiteEditorTopbarOverride({
    configuringType,
    isPreview,
    isDetailedTabs,
    onBackToVisual: visualBuffer.backToVisual,
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

  const setBranding = (branding: HotsiteBrandingResponse): void =>
    updateEditorDraft(setDraft, clearBanner, (current) => ({ ...current, branding }));
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
      publishHotsite,
      setDraft,
      onSettled: () => setView({ view: 'tabs' }),
      onBanner: setActionBanner,
      onLeadFormPublished: () => setLeadFormConfigDraft(null),
      onSaved: mode === 'visual' ? visualBuffer.resyncAfterSave : undefined,
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
    applyModuleConfig(view, setLeadFormConfigDraft, commitModuleData, clearBanner, () =>
      setView({ view: 'tabs' }),
    );

  // Only discards immediately when there's nothing to lose. Otherwise opens the discard-confirm
  // dialog instead of navigating away silently — the actual discard happens in
  // handleConfirmDiscardConfig below, once the admin confirms.
  function requestCancelConfig(): void {
    cancelModuleConfig(
      view,
      draft,
      leadFormConfigBaseline,
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
    return (
      <ModuleConfigPreviewScreen
        draft={draft}
        type={view.type}
        localData={view.localData}
        isPublishing={isPublishing}
        onPublish={(content, leadFormConfig) => void handlePublish(content, leadFormConfig)}
        onPublishBlocked={() => {
          setActionBanner({
            kind: 'publish',
            status: 'error',
            message: t('layout.panels.leadForm.validation.publishBlocked'),
          });
          setView({ view: 'tabs' });
        }}
      />
    );
  }

  if (view.view === 'preview') {
    return (
      <HotsitePreview draft={draft} onPublish={() => handlePublish()} isPublishing={isPublishing} />
    );
  }

  if (mode === 'visual') {
    return (
      <VisualHotsiteEditorView
        draft={draft}
        visualContext={visualContext}
        actionBanner={actionBanner}
        tenantSlug={tenantSlug}
        isPublishing={isPublishing}
        publishBlocked={visualBuffer.isDirty}
        inspector={visualBuffer.inspector}
        onSelectModule={visualBuffer.requestSelectModule}
        onShowContext={visualBuffer.requestGlobalContext}
        onBrandingChange={setBranding}
        onSeoChange={setSeo}
        onEditInDetail={visualBuffer.requestEditInDetail}
        onPublish={() => handlePublish()}
      />
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
