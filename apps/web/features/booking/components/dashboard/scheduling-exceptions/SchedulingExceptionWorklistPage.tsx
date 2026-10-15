'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SchedulingExceptionItem } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useOpenSchedulingExceptions } from '@/features/booking/hooks/useSchedulingExceptions';
import { useSchedulingExceptionActions } from '@/features/booking/hooks/useSchedulingExceptionActions';
import { BulkActionBar } from './BulkActionBar';
import { BulkResultList } from './BulkResultList';
import { CancelSheet } from './CancelSheet';
import { ReassignSheet } from './ReassignSheet';
import { SchedulingExceptionGroups } from './SchedulingExceptionGroups';

export function SchedulingExceptionWorklistPage(): React.JSX.Element {
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  const { data, isPending, isError, refetch } = useOpenSchedulingExceptions();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const items = useMemo(() => data?.items ?? [], [data]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  // Entries another manager closed meanwhile drop out of the selection with the refetch.
  const liveSelection = useMemo(
    () => [...selected].filter((id) => itemsById.has(id)),
    [selected, itemsById],
  );

  const actions = useSchedulingExceptionActions({
    itemsById,
    onResolved: () => setSelected(new Set()),
  });

  function toggle(id: string): void {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(groupItems: readonly SchedulingExceptionItem[]): void {
    const selectable = groupItems.filter((i) => i.booking).map((i) => i.id);
    setSelected((current) => {
      const next = new Set(current);
      const allSelected = selectable.every((id) => next.has(id));
      for (const id of selectable) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  const { sheet } = actions;
  const sheets = sheet ? (
    <>
      <ReassignSheet
        key={`reassign-${sheet.nonce}`}
        open={sheet.kind === 'reassign'}
        items={actions.entriesFor(sheet.ids)}
        isSubmitting={actions.isSubmitting}
        error={actions.sheetError}
        onClose={actions.closeSheet}
        onSubmit={actions.submitReassign}
      />
      <CancelSheet
        key={`cancel-${sheet.nonce}`}
        open={sheet.kind === 'cancel'}
        count={sheet.ids.length}
        isSubmitting={actions.isSubmitting}
        error={actions.sheetError}
        onClose={actions.closeSheet}
        onSubmit={actions.submitCancel}
      />
    </>
  ) : null;

  if (actions.resultView) {
    return (
      <div>
        <BulkResultList
          itemsById={actions.resultView.itemsById}
          results={actions.resultView.results}
          notProcessed={actions.resultView.notProcessed}
          onReassign={(id) => actions.openSheet('reassign', [id])}
          onCancel={(id) => actions.openSheet('cancel', [id])}
          onBack={actions.clearResult}
        />
        {sheets}
      </div>
    );
  }

  if (isPending) {
    return (
      <div data-testid="scheduling-exceptions-loading" aria-busy="true">
        {[0, 1, 2].map((n) => (
          <div key={n} className="mb-3 h-[5.5rem] animate-pulse rounded-lg bg-gray-200/70" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        role="alert"
        data-testid="scheduling-exceptions-load-error"
        className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700"
      >
        <p className="text-sm font-bold">{t('loadError')}</p>
        <p className="mt-1 text-sm">{t('loadErrorBody')}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => void refetch()}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card data-testid="scheduling-exceptions-empty">
        <CardContent className="px-5 py-10 text-center">
          <p className="mb-1.5 text-base font-semibold text-gray-900">{t('emptyTitle')}</p>
          <p className="mx-auto mb-4 max-w-md text-sm text-gray-500">{t('emptyBody')}</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/resources">{t('emptyAction')}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={liveSelection.length > 0 ? 'pb-36 lg:pb-16' : undefined}>
      <p className="mb-1 text-sm text-gray-500">{t('intro')}</p>

      <SchedulingExceptionGroups
        items={items}
        selected={selected}
        onToggle={toggle}
        onToggleGroup={toggleGroup}
        onReassign={(id) => actions.openSheet('reassign', [id])}
        onCancel={(id) => actions.openSheet('cancel', [id])}
      />

      {liveSelection.length > 0 ? (
        <BulkActionBar
          count={liveSelection.length}
          reassignDisabled={
            !items.some((i) => liveSelection.includes(i.id) && i.alternatives.length > 0)
          }
          onReassign={() => actions.openSheet('reassign', liveSelection)}
          onCancel={() => actions.openSheet('cancel', liveSelection)}
        />
      ) : null}
      {sheets}
    </div>
  );
}
