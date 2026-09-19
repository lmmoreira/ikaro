'use client';

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
import { buttonVariants } from '@/shared/components/ui/button';

interface DiscardChangesDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly keepEditingLabel: string;
  readonly discardLabel: string;
  readonly onConfirmDiscard: () => void;
  readonly onCancel: () => void;
  readonly confirmTestId?: string;
}

// The single "Descartar alterações?" confirmation used wherever leaving a screen would lose
// unsaved edits (HotSite module config, Serviços edit page) — replaces the native
// window.confirm() so every dashboard surface shows the same in-app dialog. Copy is passed in by
// the caller (each surface names what exactly would be lost); open state stays lifted because
// several triggers (topbar back arrow, in-page links) share one dialog.
export function DiscardChangesDialog({
  open,
  title,
  description,
  keepEditingLabel,
  discardLabel,
  onConfirmDiscard,
  onCancel,
  confirmTestId,
}: DiscardChangesDialogProps): React.JSX.Element {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{keepEditingLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={onConfirmDiscard}
            data-testid={confirmTestId}
          >
            {discardLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
