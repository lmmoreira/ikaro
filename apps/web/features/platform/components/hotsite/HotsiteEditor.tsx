'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteAdminContentResponse, HotsiteBrandingResponse } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { BrandingTab } from '@/features/platform/components/hotsite/BrandingTab';

type EditorTab = 'branding' | 'layout' | 'seo';

interface HotsiteEditorProps {
  readonly initial: HotsiteAdminContentResponse;
}

const TABS: readonly EditorTab[] = ['branding', 'layout', 'seo'];

export function HotsiteEditor({ initial }: HotsiteEditorProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage');
  const [activeTab, setActiveTab] = useState<EditorTab>('branding');
  // useState(initial) only applies on mount — page.tsx renders this once per full page load, so
  // `initial` never changes under an already-mounted editor today. If M13-S37 adds a save +
  // refetch cycle that could pass a fresh `initial` prop into a still-mounted HotsiteEditor, the
  // fix is a `key` on this component (forcing a clean remount), not a useEffect resync — this
  // repo's react-hooks/set-state-in-effect lint rule forbids setState-in-effect for exactly this
  // "adjust state to a prop" case, and there's no other call site today that needs it.
  const [draft, setDraft] = useState<HotsiteAdminContentResponse>(initial);

  function setBranding(branding: HotsiteBrandingResponse): void {
    setDraft((current) => ({ ...current, branding }));
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
          {activeTab !== 'branding' && (
            <p
              role="tabpanel"
              id={`hotsite-tabpanel-${activeTab}`}
              aria-labelledby={`hotsite-tab-${activeTab}`}
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
