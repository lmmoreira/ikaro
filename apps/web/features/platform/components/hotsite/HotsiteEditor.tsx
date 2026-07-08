'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import type {
  HotsiteAdminContentResponse,
  HotsiteBrandingResponse,
  HotsiteModuleType,
} from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { BrandingTab } from '@/features/platform/components/hotsite/BrandingTab';
import { LayoutTab } from '@/features/platform/components/hotsite/LayoutTab';
import { ModuleConfigShell } from '@/features/platform/components/hotsite/modules/ModuleConfigShell';
import { materializeLayout } from '@/features/platform/hotsite/default-layout';
import type { ModuleConfigPanelProps } from './modules/module-config-panel.types';

type EditorTab = 'branding' | 'layout' | 'seo';

interface HotsiteEditorProps {
  readonly initial: HotsiteAdminContentResponse;
}

type EditorView =
  | { readonly view: 'tabs' }
  | {
      readonly view: 'module-config';
      readonly type: HotsiteModuleType;
      readonly localData: Record<string, unknown>;
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

export function HotsiteEditor({ initial }: HotsiteEditorProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');
  const [activeTab, setActiveTab] = useState<EditorTab>('branding');
  // useState(initial) only applies on mount — page.tsx renders this once per full page load, so
  // `initial` never changes under an already-mounted editor today. If M13-S37 adds a save +
  // refetch cycle that could pass a fresh `initial` prop into a still-mounted HotsiteEditor, the
  // fix is a `key` on this component (forcing a clean remount), not a useEffect resync — this
  // repo's react-hooks/set-state-in-effect lint rule forbids setState-in-effect for exactly this
  // "adjust state to a prop" case, and there's no other call site today that needs it.
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
  const topbarStatus = useDashboardTopbarStatus();
  const setOnBackOverride = topbarStatus?.setOnBackOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const setPageTitleOverride = topbarStatus?.setPageTitleOverride;
  // "Configurar" fills the screen but isn't a route, so the shared dashboard Topbar's
  // pathname-based back-link resolution doesn't apply — push a callback override instead
  // (same pattern BookingDetailPage/ServiceEditPage use for backHrefOverride, just with a
  // function instead of a URL since there's nowhere to navigate to). Keyed on the module type,
  // not the whole `view` object, so this doesn't re-run on every keystroke while editing a panel.
  const configuringType = view.view === 'module-config' ? view.type : null;
  useEffect(() => {
    if (!configuringType) return;
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
  }, [configuringType, setOnBackOverride, setBackLabelOverride, setPageTitleOverride, t]);

  function setBranding(branding: HotsiteBrandingResponse): void {
    setDraft((current) => ({ ...current, branding }));
  }

  function setLayout(layout: HotsiteAdminContentResponse['layout']): void {
    setDraft((current) => ({ ...current, layout }));
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

  return (
    <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
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
            <p
              role="tabpanel"
              id="hotsite-tabpanel-seo"
              aria-labelledby="hotsite-tab-seo"
              data-testid="hotsite-tab-placeholder"
              data-tab={activeTab}
              className="text-sm text-gray-500"
            >
              {t('comingSoon')}
            </p>
          )}

          <div className="rounded-md border-2 border-dashed border-red-200 p-4">
            <p className="mb-2 text-sm font-bold text-red-800">{t('dangerZoneTitle')}</p>
            <Button
              type="button"
              variant="destructive"
              disabled
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
                disabled
                className="w-full"
                data-testid="hotsite-publish-desktop"
              >
                {t('publish')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled
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

      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <Button
          type="button"
          variant="outline"
          disabled
          className="flex-1"
          data-testid="hotsite-preview-mobile"
        >
          {t('preview')}
        </Button>
        <Button type="button" disabled className="flex-[2]" data-testid="hotsite-publish-mobile">
          {t('publish')}
        </Button>
      </div>
    </div>
  );
}
