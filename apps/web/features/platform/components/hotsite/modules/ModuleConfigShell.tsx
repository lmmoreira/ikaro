'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button, buttonVariants } from '@/shared/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { MOBILE_ACTION_BAR_CLEARANCE_CLASS } from '@/shells/dashboard/utils/mobile-action-bar';

interface ModuleConfigShellProps {
  readonly moduleLabel: string;
  readonly onBack: () => void;
  readonly onApply: () => void;
  readonly onPreview: () => void;
  readonly discardConfirmOpen: boolean;
  readonly onConfirmDiscard: () => void;
  readonly onCancelDiscard: () => void;
  readonly children: React.ReactNode;
}

// Replicates 01d-module-config-hero.html's drill-down chrome (content-left/sticky-aside-right on
// desktop, fixed mobile action bar) using the same grid/aside/fixed-bar Tailwind pattern
// HotsiteEditor.tsx already established for its own tabs+publish layout — not a new visual
// language, just the same shell reused one level deeper for a single module's config. The back
// arrow + title live in the shared dashboard Topbar (HotsiteEditor pushes an onBackOverride +
// pageTitleOverride into topbar-status-context), matching where every other dashboard drill-down
// screen puts its back navigation — not duplicated here.
//
// `discardConfirmOpen` is lifted state, not local — the topbar back arrow (outside this
// component's subtree entirely) also needs to open the same dialog, via HotsiteEditor's
// requestCancelConfig/ref wiring (see HotsiteEditor.tsx). This component only owns the dialog's
// visual rendering, not the decision to open it.
export function ModuleConfigShell({
  moduleLabel,
  onBack,
  onApply,
  onPreview,
  discardConfirmOpen,
  onConfirmDiscard,
  onCancelDiscard,
  children,
}: ModuleConfigShellProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.configShell');
  const tRoot = useTranslations('dashboard.hotsitePage');

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
                onClick={onPreview}
                data-testid="module-config-preview-desktop"
              >
                {tRoot('preview')}
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

      <div
        className={`fixed inset-x-0 ${MOBILE_ACTION_BAR_CLEARANCE_CLASS} z-20 flex gap-3 border-t border-gray-200 bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden`}
      >
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
          variant="outline"
          className="flex-1"
          onClick={onPreview}
          data-testid="module-config-preview-mobile"
        >
          {tRoot('preview')}
        </Button>
        <Button
          type="button"
          className="flex-1"
          onClick={onApply}
          data-testid="module-config-apply-mobile"
        >
          {t('applyLabel')}
        </Button>
      </div>

      <AlertDialog
        open={discardConfirmOpen}
        onOpenChange={(open) => {
          if (!open) onCancelDiscard();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('discardConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('discardConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('discardConfirmKeepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={onConfirmDiscard}
              data-testid="module-config-discard-confirm"
            >
              {t('discardConfirmDiscardButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
