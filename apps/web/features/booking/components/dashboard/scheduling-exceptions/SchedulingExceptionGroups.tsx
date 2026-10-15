'use client';

import { useTranslations } from 'next-intl';
import type { SchedulingExceptionItem } from '@ikaro/types';
import { groupBySource } from '@/features/booking/model/scheduling-exception-view';
import { SchedulingExceptionRow } from './SchedulingExceptionRow';

interface SchedulingExceptionGroupsProps {
  readonly items: readonly SchedulingExceptionItem[];
  readonly selected: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly onToggleGroup: (items: readonly SchedulingExceptionItem[]) => void;
  readonly onReassign: (id: string) => void;
  readonly onCancel: (id: string) => void;
}

// One section per unavailable resource, drawn like the Agenda queue's sections (a small uppercase
// title, a line, the count) with the group's "Selecionar todos" on the right.
export function SchedulingExceptionGroups({
  items,
  selected,
  onToggle,
  onToggleGroup,
  onReassign,
  onCancel,
}: SchedulingExceptionGroupsProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedulingExceptionsPage');

  return (
    <>
      {groupBySource(items).map((group) => (
        <section key={group.sourceId} className="mb-6" data-testid="scheduling-exceptions-group">
          <div className="mb-3 mt-5 flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              {t('groupTitle', { name: group.sourceName ?? '—' })}
            </h2>
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-[0.6875rem] font-bold text-gray-400">
              {t('groupCount', { count: group.items.length })}
            </span>
            <button
              type="button"
              onClick={() => onToggleGroup(group.items)}
              className="cursor-pointer text-xs font-semibold text-blue-600"
            >
              {t('selectAll')}
            </button>
          </div>
          {group.items.map((item) => (
            <SchedulingExceptionRow
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggleSelected={onToggle}
              onReassign={onReassign}
              onCancel={onCancel}
            />
          ))}
        </section>
      ))}
    </>
  );
}
