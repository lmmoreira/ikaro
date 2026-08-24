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
import { ModuleConfigShell } from '@/features/platform/components/hotsite/modules/ModuleConfigShell';
import {
  HotsiteEditorMainView,
  type ActionBanner,
  type EditorTab,
} from '@/features/platform/components/hotsite/HotsiteEditorMainView';
import { materializeLayout } from '@/features/platform/hotsite/default-layout';
import { stripResolvedImageUrls } from '@/features/platform/hotsite/strip-resolved-image-urls';
import type { ManifestDraft } from '@/features/platform/hotsite/manifest-schema';
import {
  useUpdateHotsiteConfig,
  usePublishHotsite,
  useUnpublishHotsite,
} from '@/features/platform/hotsite/useHotsite';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useHotsiteEditorTopbarOverride } from '@/features/platform/hotsite/useHotsiteEditorTopbarOverride';
import { MODULE_CONFIG_PANELS, HotsitePreview } from './hotsite-editor-lazy-panels';

interface HotsiteEditorProps {
  readonly initial: HotsiteAdminContentResponse;
}

type EditorView =
  | { readonly view: 'tabs' }
  | { readonly view: 'preview' }
  | {
      readonly view: 'module-config';
      readonly type: HotsiteModuleType;
      readonly localData: Record<string, unknown>;
    }
  | {
      readonly view: 'module-config-preview';
      readonly type: HotsiteModuleType;
      readonly localData: Record<string, unknown>;
    };

function mergeLocalDataIntoLayout(
  layout: HotsiteAdminContentResponse['layout'],
  type: HotsiteModuleType,
  localData: Record<string, unknown>,
): HotsiteAdminContentResponse['layout'] {
  return layout.map((m) => (m.type === type ? { ...m, data: localData } : m));
}

// Structural comparison only — this data is always plain JSON coming straight out of the config
// panels (no functions/dates), so JSON.stringify is sufficient. If a panel ever rebuilds an
// unchanged object with different key insertion order, this reports a false "dirty" (an
// unnecessary discard-confirm prompt) but never a false "clean" — the safe direction to be wrong
// in, since it never silently discards a real edit.
function isModuleDataDirty(
  committed: Record<string, unknown>,
  local: Record<string, unknown>,
): boolean {
  return JSON.stringify(committed) !== JSON.stringify(local);
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
  const publishHotsite = usePublishHotsite();
  const unpublishHotsite = useUnpublishHotsite();
  const isPublishing = updateConfig.isPending || publishHotsite.isPending;
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

  // Any edit here invalidates the "this is already live" claim a publish/unpublish success
  // banner makes — without clearing it, the banner from a previous publish keeps showing while
  // the admin makes further, still-unsaved changes, making it look like those are live too.
  function setBranding(branding: HotsiteBrandingResponse): void {
    setDraft((current) => ({ ...current, branding }));
    setActionBanner(null);
  }

  function setLayout(layout: HotsiteAdminContentResponse['layout']): void {
    setDraft((current) => ({ ...current, layout }));
    setActionBanner(null);
  }

  function setSeo(seo: HotsiteSeoResponse): void {
    setDraft((current) => ({ ...current, seo }));
    setActionBanner(null);
  }

  function handleManifestApply(next: ManifestDraft): void {
    setDraft((current) => ({ ...current, ...next }));
    setActionBanner(null);
  }

  // `contentOverride` lets Publish be triggered from the module-config-preview screen (Part 2
  // below), where the visually-displayed content is `draft` merged with an in-progress module
  // edit that hasn't gone through "Aplicar" yet — submitting exactly what's shown in one call,
  // rather than a separate "apply, then publish" step. The ordinary tabs -> Preview -> Publish
  // path passes no override and behaves exactly as before.
  async function handlePublish(contentOverride?: HotsiteAdminContentResponse): Promise<void> {
    const content = contentOverride ?? draft;
    try {
      const stripped = stripResolvedImageUrls(
        content.branding,
        content.layout,
        content.seo,
        tenantId,
      );
      const updated = await updateConfig.mutateAsync({
        branding: stripped.branding,
        layout: stripped.layout,
        seo: stripped.seo,
      });
      // The PATCH response reflects any tmp/ -> permanent path promotion that just happened
      // server-side (UpdateHotsiteContentUseCase rewrites the stored reference and returns it).
      // Merge it back into `draft` — otherwise a still-unsaved tmp/ reference sits in local state
      // forever, and a *later* save resubmits it even though its tmp/ object was already deleted
      // by this promotion, failing with HotsiteImageNotUploadedError (see
      // td/TD22-ORPHANED-UPLOAD-CLEANUP.md).
      setDraft((current) => ({
        ...current,
        ...updated,
        layout: materializeLayout(updated.layout),
      }));
      await publishHotsite.mutateAsync();
      setView({ view: 'tabs' });
      setActionBanner({ kind: 'publish', status: 'success' });
    } catch (err) {
      // The banner only renders in the tabs view — switch back on failure too, or a publish
      // triggered from Preview leaves the admin stuck there with no visible error feedback.
      setView({ view: 'tabs' });
      setActionBanner({
        kind: 'publish',
        status: 'error',
        message: resolveErrorMessageFromApiError(err, locale),
      });
    }
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  async function handleUnpublish(): Promise<void> {
    try {
      await unpublishHotsite.mutateAsync();
      setActionBanner({ kind: 'unpublish', status: 'success' });
    } catch (err) {
      setActionBanner({
        kind: 'unpublish',
        status: 'error',
        message: resolveErrorMessageFromApiError(err, locale),
      });
    }
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  function handleConfigure(type: HotsiteModuleType): void {
    const selectedModule = draft.layout.find((m) => m.type === type);
    setView({ view: 'module-config', type, localData: selectedModule?.data ?? {} });
  }

  function handleLocalDataChange(localData: Record<string, unknown>): void {
    setView((current) => (current.view === 'module-config' ? { ...current, localData } : current));
  }

  function handleApply(): void {
    if (view.view !== 'module-config') return;
    const { type, localData } = view;
    setDraft((current) => ({
      ...current,
      layout: mergeLocalDataIntoLayout(current.layout, type, localData),
    }));
    setActionBanner(null);
    setView({ view: 'tabs' });
  }

  // Only discards immediately when there's nothing to lose. Otherwise opens the discard-confirm
  // dialog instead of navigating away silently — the actual discard happens in
  // handleConfirmDiscardConfig below, once the admin confirms.
  function requestCancelConfig(): void {
    if (view.view !== 'module-config') return;
    const committedData = draft.layout.find((m) => m.type === view.type)?.data ?? {};
    if (isModuleDataDirty(committedData, view.localData)) {
      setDiscardConfirmOpen(true);
    } else {
      setView({ view: 'tabs' });
    }
  }

  function handleConfirmDiscardConfig(): void {
    setDiscardConfirmOpen(false);
    setView({ view: 'tabs' });
  }

  function handleCancelDiscardConfig(): void {
    setDiscardConfirmOpen(false);
  }

  if (view.view === 'module-config') {
    const Panel = MODULE_CONFIG_PANELS[view.type];
    // Defensive only — unreachable today (manifest-schema.ts's MODULE_TYPE_SET, derived from
    // MODULE_ORDER, already rejects any module type without a panel entry before a view for it
    // can be set), kept for the same "never crash on a missing map entry" discipline as
    // default-layout.ts's `?? {}` fallback.
    if (!Panel) return <></>;
    return (
      <ModuleConfigShell
        moduleLabel={t(`layout.modules.${view.type}`)}
        onBack={requestCancelConfig}
        onApply={handleApply}
        onPreview={() =>
          setView({ view: 'module-config-preview', type: view.type, localData: view.localData })
        }
        discardConfirmOpen={discardConfirmOpen}
        onConfirmDiscard={handleConfirmDiscardConfig}
        onCancelDiscard={handleCancelDiscardConfig}
      >
        <Panel data={view.localData} onChange={handleLocalDataChange} />
      </ModuleConfigShell>
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
        onPublish={() => handlePublish(previewDraft)}
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
