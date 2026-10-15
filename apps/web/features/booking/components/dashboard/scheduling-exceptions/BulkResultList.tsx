'use client';

import { useTranslations } from 'next-intl';
import type { SchedulingExceptionItem, SchedulingExceptionResultItem } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { SchedulingExceptionRow } from './SchedulingExceptionRow';

interface BulkResultListProps {
  // The entries as they were when the action was sent (the list refreshes underneath).
  readonly itemsById: ReadonlyMap<string, SchedulingExceptionItem>;
  readonly results: readonly SchedulingExceptionResultItem[];
  // Ids never sent because a later batch failed as a whole request — they stay open.
  readonly notProcessed: readonly string[];
  readonly onReassign: (id: string) => void;
  readonly onCancel: (id: string) => void;
  readonly onBack: () => void;
}

// Shown in place of the list after any bulk action: one card per entry, resolved or still open
// with its reason. DISTINCT from a whole-request failure (the sheet's inline error): here some
// bookings changed; there, nothing did.
export function BulkResultList({
  itemsById,
  results,
  notProcessed,
  onReassign,
  onCancel,
  onBack,
}: BulkResultListProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  const locale = useResolvedLocale();
  const resolved = results.filter((r) => r.outcome === 'RESOLVED').length;
  const stillOpen = results.length - resolved + notProcessed.length;
  const hasOpen = stillOpen > 0;

  return (
    <div data-testid="scheduling-exceptions-result">
      <div
        className={`mb-4 rounded-md border p-4 ${hasOpen ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-green-300 bg-green-50 text-green-800'}`}
      >
        <p className="text-sm font-bold">
          {t('resultResolved', { count: resolved })}
          {hasOpen ? ` · ${t('resultOpen', { count: stillOpen })}` : ''}
        </p>
        <p className="mt-1 text-sm">{t('resultBody')}</p>
        {notProcessed.length > 0 ? (
          <p
            className="mt-1 text-sm font-semibold"
            data-testid="scheduling-exceptions-not-processed"
          >
            {t('resultNotProcessed', { count: notProcessed.length })}
          </p>
        ) : null}
      </div>

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
          {t('resultSectionTitle')}
        </h2>
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[0.6875rem] font-bold text-gray-400">
          {t('groupCount', { count: results.length })}
        </span>
      </div>

      {results.map((result) => {
        const item = itemsById.get(result.exceptionId);
        if (!item) return null;
        return (
          <SchedulingExceptionRow
            key={result.exceptionId}
            item={item}
            outcome={
              result.outcome === 'RESOLVED'
                ? { kind: 'resolved' }
                : { kind: 'open', reason: resolveErrorMessage(result.errorCode, locale) }
            }
            onReassign={onReassign}
            onCancel={onCancel}
          />
        );
      })}

      <Button type="button" variant="outline" className="mt-2 w-full" onClick={onBack}>
        {t('backToList')}
      </Button>
    </div>
  );
}
