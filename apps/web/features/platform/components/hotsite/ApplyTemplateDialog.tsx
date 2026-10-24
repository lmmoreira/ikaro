'use client';

import { useTranslations } from 'next-intl';
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

interface ApplyTemplateDialogProps {
  readonly open: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

// Asked only when applying would replace images the manager uploaded themselves: the next save
// deletes them for good (Undo only works before saving). Same composition as DiscardChangesDialog.
export function ApplyTemplateDialog({
  open,
  onConfirm,
  onCancel,
}: ApplyTemplateDialogProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.templates');
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <AlertDialogContent data-testid="apply-template-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('replaceConfirm.title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('imagesWarning')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="apply-template-cancel">
            {t('replaceConfirm.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} data-testid="apply-template-confirm">
            {t('replaceConfirm.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
