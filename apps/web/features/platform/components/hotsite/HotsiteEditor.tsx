'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type {
  HotsiteAdminContentResponse,
  HotsiteBrandingResponse,
  HotsiteModuleType,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { MOBILE_ACTION_BAR_CLEARANCE_CLASS } from '@/shells/dashboard/utils/mobile-action-bar';
import { useTenant } from '@/providers/tenant-provider';
import { BrandingTab } from '@/features/platform/components/hotsite/BrandingTab';
import { LayoutTab } from '@/features/platform/components/hotsite/LayoutTab';
import { SeoTab } from '@/features/platform/components/hotsite/SeoTab';
import { ModuleConfigShell } from '@/features/platform/components/hotsite/modules/ModuleConfigShell';
import { materializeLayout } from '@/features/platform/hotsite/default-layout';
import { stripResolvedImageUrls } from '@/features/platform/hotsite/strip-resolved-image-urls';
import {
  useUpdateHotsiteConfig,
  usePublishHotsite,
  useUnpublishHotsite,
} from '@/features/platform/hotsite/useHotsite';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import type { ModuleConfigPanelProps } from './modules/module-config-panel.types';

type EditorTab = 'branding' | 'layout' | 'seo';

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
    };

type ActionBanner = {
  readonly kind: 'publish' | 'unpublish';
  readonly status: 'success' | 'error';
  readonly message?: string;
};

const TABS: readonly EditorTab[] = ['branding', 'layout', 'seo'];

// Each panel is lazy-loaded so a manager who never opens "Configurar" on a given module never
// downloads that panel's JS — the same code-splitting benefit a real route would give, without
// needing to lift `draft` into a layout.tsx/Context (see the view-swap note below).
const MODULE_CONFIG_PANELS: Record<
  HotsiteModuleType,
  React.ComponentType<ModuleConfigPanelProps>
> = {
  HERO: dynamic(() => import('./modules/HeroConfigPanel').then((m) => m.HeroConfigPanel), {
    ssr: false,
  }),
  SERVICE_LIST: dynamic(
    () => import('./modules/ServiceListConfigPanel').then((m) => m.ServiceListConfigPanel),
    { ssr: false },
  ),
  GALLERY: dynamic(() => import('./modules/GalleryConfigPanel').then((m) => m.GalleryConfigPanel), {
    ssr: false,
  }),
  TESTIMONIALS: dynamic(
    () => import('./modules/TestimonialsConfigPanel').then((m) => m.TestimonialsConfigPanel),
    { ssr: false },
  ),
  BOOKING_CTA: dynamic(
    () => import('./modules/BookingCtaConfigPanel').then((m) => m.BookingCtaConfigPanel),
    { ssr: false },
  ),
  ABOUT: dynamic(() => import('./modules/AboutConfigPanel').then((m) => m.AboutConfigPanel), {
    ssr: false,
  }),
  CONTACT: dynamic(() => import('./modules/ContactConfigPanel').then((m) => m.ContactConfigPanel), {
    ssr: false,
  }),
  FOOTER: dynamic(() => import('./modules/FooterConfigPanel').then((m) => m.FooterConfigPanel), {
    ssr: false,
  }),
};

// Lazy-loaded for the same reason as the module config panels above: the M12 public hotsite
// render components it pulls in cost zero client JS on the public page (Server Components there),
// but become client-hydrated code once imported into this 'use client' tree — so that cost should
// only be paid by managers who actually click "Preview," not every visit to /dashboard/hotsite.
const HotsitePreview = dynamic(() => import('./HotsitePreview').then((m) => m.HotsitePreview), {
  ssr: false,
});

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
  useEffect(() => {
    if (configuringType) {
      const backToTabs = () => setView({ view: 'tabs' });
      setOnBackOverride?.(() => backToTabs);
      setBackLabelOverride?.(t('layout.configShell.backLabel'));
      const moduleLabel = t(`layout.modules.${configuringType}`);
      setPageTitleOverride?.(`${t('layout.configShell.titlePrefix')}: ${moduleLabel}`);
      return () => {
        setOnBackOverride?.(null);
        setBackLabelOverride?.(null);
        setPageTitleOverride?.(null);
      };
    }
    if (isPreview) {
      const backToTabs = () => setView({ view: 'tabs' });
      setOnBackOverride?.(() => backToTabs);
      setBackLabelOverride?.(t('previewView.backLabel'));
      setPageTitleOverride?.(t('previewView.pageTitle'));
      return () => {
        setOnBackOverride?.(null);
        setBackLabelOverride?.(null);
        setPageTitleOverride?.(null);
      };
    }
    return undefined;
  }, [
    configuringType,
    isPreview,
    setOnBackOverride,
    setBackLabelOverride,
    setPageTitleOverride,
    t,
  ]);

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

  async function handlePublish(): Promise<void> {
    try {
      const stripped = stripResolvedImageUrls(draft.branding, draft.layout, tenantId);
      const updated = await updateConfig.mutateAsync({
        branding: stripped.branding,
        layout: stripped.layout,
        seo: draft.seo,
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
    const module = draft.layout.find((m) => m.type === type);
    setView({ view: 'module-config', type, localData: module?.data ?? {} });
  }

  function handleLocalDataChange(localData: Record<string, unknown>): void {
    setView((current) => (current.view === 'module-config' ? { ...current, localData } : current));
  }

  function handleApply(): void {
    if (view.view !== 'module-config') return;
    const { type, localData } = view;
    setDraft((current) => ({
      ...current,
      layout: current.layout.map((m) => (m.type === type ? { ...m, data: localData } : m)),
    }));
    setActionBanner(null);
    setView({ view: 'tabs' });
  }

  function handleCancelConfig(): void {
    setView({ view: 'tabs' });
  }

  if (view.view === 'module-config') {
    const Panel = MODULE_CONFIG_PANELS[view.type];
    return (
      <ModuleConfigShell
        moduleLabel={t(`layout.modules.${view.type}`)}
        onBack={handleCancelConfig}
        onApply={handleApply}
      >
        <Panel data={view.localData} onChange={handleLocalDataChange} />
      </ModuleConfigShell>
    );
  }

  if (view.view === 'preview') {
    return <HotsitePreview draft={draft} onPublish={handlePublish} isPublishing={isPublishing} />;
  }

  return (
    <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      {actionBanner?.status === 'success' && (
        <output
          data-testid="hotsite-action-success-banner"
          className="flex items-start gap-3.5 rounded-xl border border-green-300 bg-green-50 p-4"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
          >
            ✓
          </span>
          <span>
            <span className="block text-sm font-bold text-green-800">
              {t(actionBanner.kind === 'publish' ? 'publishSuccessTitle' : 'unpublishSuccessTitle')}
            </span>
            <span className="mt-0.5 block text-sm text-green-700">
              {t(actionBanner.kind === 'publish' ? 'publishSuccessBody' : 'unpublishSuccessBody', {
                slug: tenantSlug,
              })}
            </span>
          </span>
        </output>
      )}
      {actionBanner?.status === 'error' && (
        <div
          role="alert"
          data-testid="hotsite-action-error-banner"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700"
        >
          {actionBanner.message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4 lg:space-y-6">
          <div className="flex gap-1 border-b border-gray-200" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`hotsite-tab-${tab}`}
                aria-controls={`hotsite-tabpanel-${tab}`}
                data-testid="hotsite-tab"
                data-tab={tab}
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-t-md px-4 py-2.5 text-sm font-semibold transition-colors ${
                  activeTab === tab
                    ? '-mb-px border-b-2 border-blue-600 text-blue-600'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {t(`tabs.${tab}`)}
              </button>
            ))}
          </div>

          {activeTab === 'branding' && (
            <div
              role="tabpanel"
              id="hotsite-tabpanel-branding"
              aria-labelledby="hotsite-tab-branding"
            >
              <BrandingTab value={draft.branding} onChange={setBranding} />
            </div>
          )}
          {activeTab === 'layout' && (
            <div role="tabpanel" id="hotsite-tabpanel-layout" aria-labelledby="hotsite-tab-layout">
              <LayoutTab layout={draft.layout} onChange={setLayout} onConfigure={handleConfigure} />
            </div>
          )}
          {activeTab === 'seo' && (
            <div role="tabpanel" id="hotsite-tabpanel-seo" aria-labelledby="hotsite-tab-seo">
              <SeoTab value={draft.seo} onChange={setSeo} />
            </div>
          )}

          <div className="rounded-md border-2 border-dashed border-red-200 p-4">
            <p className="mb-2 text-sm font-bold text-red-800">{t('dangerZoneTitle')}</p>
            <Button
              type="button"
              variant="destructive"
              disabled={unpublishHotsite.isPending}
              onClick={handleUnpublish}
              data-testid="hotsite-unpublish-button"
            >
              {t('unpublish')}
            </Button>
          </div>
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <Button
                type="button"
                disabled={isPublishing}
                onClick={handlePublish}
                className="w-full"
                data-testid="hotsite-publish-desktop"
              >
                {t('publish')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setView({ view: 'preview' })}
                className="w-full"
                data-testid="hotsite-preview-desktop"
              >
                {t('preview')}
              </Button>
              <hr className="border-t border-gray-200" />
              <p className="text-sm leading-6 text-gray-500">{t('unpublishedHint')}</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div
        className={`fixed inset-x-0 ${MOBILE_ACTION_BAR_CLEARANCE_CLASS} z-20 flex gap-3 border-t border-gray-200 bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden`}
      >
        <Button
          type="button"
          variant="outline"
          onClick={() => setView({ view: 'preview' })}
          className="flex-1"
          data-testid="hotsite-preview-mobile"
        >
          {t('preview')}
        </Button>
        <Button
          type="button"
          disabled={isPublishing}
          onClick={handlePublish}
          className="flex-[2]"
          data-testid="hotsite-publish-mobile"
        >
          {t('publish')}
        </Button>
      </div>
    </div>
  );
}
