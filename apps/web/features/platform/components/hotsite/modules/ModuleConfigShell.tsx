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

// Replicates 01d-module-config-hero.html's drill-down chrome (content-left/sticky-aside-right on
// desktop, fixed mobile action bar) using the same grid/aside/fixed-bar Tailwind pattern
// HotsiteEditor.tsx already established for its own tabs+publish layout — not a new visual
// language, just the same shell reused one level deeper for a single module's config. The back
// arrow + title live in the shared dashboard Topbar (HotsiteEditor pushes an onBackOverride +
// pageTitleOverride into topbar-status-context), matching where every other dashboard drill-down
// screen puts its back navigation — not duplicated here.
export function ModuleConfigShell({
  moduleLabel,
  onBack,
  onApply,
  children,
}: ModuleConfigShellProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.configShell');

  return (
    <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
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

      {/* bottom-[calc(...)] clears the dashboard BottomNav, which renders on /dashboard/hotsite
          (see BottomNav.tsx's comment) — sitting at bottom-0 would overlap and hide it. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-20 flex gap-3 border-t border-gray-200 bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
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
