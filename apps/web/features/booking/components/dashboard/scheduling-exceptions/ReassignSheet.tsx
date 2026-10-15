'use client';

import { useMemo, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { SchedulingExceptionItem, SchedulingExceptionReassignTarget } from '@ikaro/types';
import { BookingActionSheetShell } from '@/features/booking/components/dashboard/bookings/BookingActionSheetShell';
import { useModalDialog } from '@/features/booking/hooks/use-modal-dialog';
import { buildReassignChoices } from '@/features/booking/model/scheduling-exception-view';

const AUTO = 'AUTO';

interface ReassignSheetProps {
  readonly open: boolean;
  // The entries being reassigned (the selection, or the one row's entry).
  readonly items: readonly SchedulingExceptionItem[];
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    readonly target: SchedulingExceptionReassignTarget;
    readonly reason?: string;
  }) => Promise<void>;
}

export function ReassignSheet({
  open,
  items,
  isSubmitting,
  error,
  onClose,
  onSubmit,
}: ReassignSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  const dialogRef = useModalDialog(open);
  const [choice, setChoice] = useState<string>(AUTO);
  const [reason, setReason] = useState('');
  const choices = useMemo(() => buildReassignChoices(items), [items]);

  if (!open) return null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await onSubmit({
      target: choice === AUTO ? { mode: 'AUTO' } : { resourceId: choice },
      reason: reason.trim() || undefined,
    });
  }

  // Name and hint are direct children of the label (jsx-a11y wants the label text one level deep).
  const optionClass = (selected: boolean) =>
    `mb-2 flex cursor-pointer flex-wrap items-center gap-x-2.5 rounded-md border px-3.5 py-3 text-sm ${
      selected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white'
    }`;

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId="reassign-sheet-title"
      descriptionId="reassign-sheet-description"
      title={t('reassignTitle', { count: items.length })}
      description={t('reassignDescription')}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={t('back')}
      submitLabel={t('reassignSubmit', { count: items.length })}
      submitDisabled={isSubmitting}
      error={error}
    >
      <div role="radiogroup" aria-label={t('reassign')}>
        <label className={optionClass(choice === AUTO)}>
          <input
            type="radio"
            name="reassign-target"
            value={AUTO}
            checked={choice === AUTO}
            onChange={() => setChoice(AUTO)}
            className="accent-blue-600"
          />
          <span className="font-semibold text-gray-900">{t('reassignAutoLabel')}</span>
          <span className="basis-full pl-6 text-xs text-gray-500">{t('reassignAutoHint')}</span>
        </label>
        {choices.map((c) => (
          <label key={c.resourceId} className={optionClass(choice === c.resourceId)}>
            <input
              type="radio"
              name="reassign-target"
              value={c.resourceId}
              checked={choice === c.resourceId}
              onChange={() => setChoice(c.resourceId)}
              className="accent-blue-600"
            />
            <span className="font-semibold text-gray-900">{c.resourceName}</span>
            <span className="basis-full pl-6 text-xs text-gray-500">
              {t('reassignFreeIn', { free: c.freeIn, total: c.total })}
            </span>
          </label>
        ))}
      </div>

      <label className="mt-3 block">
        <span className="mb-2 block text-sm font-medium text-gray-700">
          {t('reasonLabel')} <span className="font-normal text-gray-400">({t('optional')})</span>
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          rows={2}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
        />
        <span className="mt-1 block text-xs text-gray-400">{t('reasonHelp')}</span>
      </label>
    </BookingActionSheetShell>
  );
}
