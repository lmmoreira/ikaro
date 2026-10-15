'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';

interface BulkActionBarProps {
  readonly count: number;
  readonly onReassign: () => void;
  readonly onCancel: () => void;
}

// Fixed, like the Settings/Hotsite action bars: on mobile it sits ABOVE the bottom nav (which
// stays), on desktop it clears the 15rem sidebar. Only the actions that work on many entries at
// once — Reagendar is one booking at a time, so it lives on the row and is never in this bar.
export function BulkActionBar({
  count,
  onReassign,
  onCancel,
}: BulkActionBarProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedulingExceptionsPage');

  return (
    <div
      data-testid="scheduling-exceptions-bulk-bar"
      className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom,0px))] z-20 flex flex-col gap-2 border-t bg-white px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:bottom-0 lg:left-60 lg:flex-row lg:items-center lg:gap-4 lg:px-6"
    >
      <div>
        <p className="text-sm font-bold text-gray-900">{t('selectedCount', { count })}</p>
        <p className="text-xs text-gray-500">{t('rescheduleOneAtATime')}</p>
      </div>
      <div className="flex gap-2 lg:ml-auto">
        <Button type="button" size="sm" className="flex-1 lg:flex-none" onClick={onReassign}>
          {t('reassign')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="flex-1 lg:flex-none"
          onClick={onCancel}
        >
          {t('cancel')}
        </Button>
      </div>
    </div>
  );
}
