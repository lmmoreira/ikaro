'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AdminCancelBookingSheetProps {
  readonly open: boolean;
  readonly isSubmitting: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (reason?: string) => Promise<void>;
}

export function AdminCancelBookingSheet({
  open,
  isSubmitting,
  onClose,
  onSubmit,
}: AdminCancelBookingSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.bookingDetail');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      await onSubmit(reason.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('cancelError'));
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label={t('close')}
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <form
        onSubmit={handleSubmit}
        className={cn(
          'relative z-10 w-full border border-gray-200 bg-white p-4 shadow-2xl sm:max-w-lg sm:rounded-2xl',
          'rounded-t-2xl',
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">{t('cancelSheetTitle')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('cancelSheetDescription')}</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-gray-500">
            {t('close')}
          </button>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-gray-700">
            {t('reasonLabel')} <span className="font-normal text-gray-400">({t('optional')})</span>
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={200}
            rows={5}
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
            placeholder={t('cancelPlaceholder')}
          />
        </label>

        <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
          <span>{t('optional')}</span>
          <span>{reason.trim().length} / 200</span>
        </div>

        {error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div className="mt-4 flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {t('submitCancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
