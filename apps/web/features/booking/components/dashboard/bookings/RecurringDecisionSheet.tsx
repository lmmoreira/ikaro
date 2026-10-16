'use client';

import type { SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useModalDialog } from '@/features/booking/hooks/use-modal-dialog';
import { BookingActionSheetShell } from './BookingActionSheetShell';

interface RecurringDecisionSheetProps {
  readonly kind: 'approve' | 'reject';
  readonly open: boolean;
  // What the decision will do, already worded for this request (customer, period, pattern, count).
  readonly summary: string;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void | Promise<void>;
}

// The confirmation before a recurring-schedule decision (UC-071). Both decisions are one-shot — the
// first creates every reservation of the term, the second cannot be undone — so each asks once. It
// has no fields: the reject endpoint takes no reason.
export function RecurringDecisionSheet({
  kind,
  open,
  summary,
  isSubmitting,
  onClose,
  onConfirm,
}: RecurringDecisionSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.recurringApproval');
  const dialogRef = useModalDialog(open);

  if (!open) return null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onConfirm();
  }

  const isApprove = kind === 'approve';
  const confirmLabel = isApprove ? t('confirmApprove') : t('confirmReject');

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId={`recurring-${kind}-sheet-title`}
      descriptionId={`recurring-${kind}-sheet-description`}
      title={isApprove ? t('approveSheetTitle') : t('rejectSheetTitle')}
      description={summary}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={t('sheetBack')}
      submitLabel={isSubmitting ? t('submitting') : confirmLabel}
      submitVariant={isApprove ? 'default' : 'destructive'}
      submitDisabled={isSubmitting}
      error={null}
    >
      {null}
    </BookingActionSheetShell>
  );
}
