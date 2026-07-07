'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';

interface ModuleConfigShellProps {
  readonly moduleLabel: string;
  readonly onBack: () => void;
  readonly onApply: () => void;
  readonly children: React.ReactNode;
}

// Replicates 01d-module-config-hero.html's drill-down chrome (back arrow + title, content-left/
// sticky-aside-right on desktop, fixed mobile action bar) using the same grid/aside/fixed-bar
// Tailwind pattern HotsiteEditor.tsx already established for its own tabs+publish layout — not a
// new visual language, just the same shell reused one level deeper for a single module's config.
export function ModuleConfigShell({
  moduleLabel,
  onBack,
  onApply,
  children,
}: ModuleConfigShellProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.configShell');

  return (
    <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <button
        type="button"
        data-testid="module-config-back"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
        {t('backLabel')}
      </button>

      <h2 className="text-lg font-semibold text-gray-900">
        {t('titlePrefix')}: {moduleLabel}
      </h2>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4 lg:space-y-6">{children}</div>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <p className="text-sm leading-6 text-gray-500">
                {t('titlePrefix')}: <strong className="text-gray-700">{moduleLabel}</strong>
                <br />
                {t('description')}
              </p>
              <Button
                type="button"
                className="w-full"
                onClick={onApply}
                data-testid="module-config-apply-desktop"
              >
                {t('applyLabel')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={onBack}
                data-testid="module-config-cancel-desktop"
              >
                {t('cancelLabel')}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 flex gap-3 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onBack}
          data-testid="module-config-cancel-mobile"
        >
          {t('cancelLabel')}
        </Button>
        <Button
          type="button"
          className="flex-[2]"
          onClick={onApply}
          data-testid="module-config-apply-mobile"
        >
          {t('applyLabel')}
        </Button>
      </div>
    </div>
  );
}
