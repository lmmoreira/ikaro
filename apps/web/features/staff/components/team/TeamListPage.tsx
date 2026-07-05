'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import type { StaffListItem, StaffStatus } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/utils/cn';
import { MemberRow } from './MemberRow';

type TeamFilter = 'all' | StaffStatus;

interface TeamListPageProps {
  readonly members: readonly StaffListItem[];
  readonly currentStaffId: string;
  // True when the backend's single-page fetch (limit=100) didn't return the full roster —
  // tab counts and the list itself are then a partial view, not the whole team.
  readonly hasMore: boolean;
}

function buildFilterClass(active: boolean): string {
  return cn(
    'rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors',
    active
      ? 'border-blue-600 bg-blue-600 text-white'
      : 'border-border bg-white text-gray-900 hover:bg-slate-50',
  );
}

const FILTERS: readonly { key: TeamFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'tabAll' },
  { key: 'ACTIVE', labelKey: 'tabActive' },
  { key: 'PENDING', labelKey: 'tabPending' },
  { key: 'DEACTIVATED', labelKey: 'tabInactive' },
];

export function TeamListPage({
  members,
  currentStaffId,
  hasMore,
}: TeamListPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.teamPage');
  const [filter, setFilter] = useState<TeamFilter>('all');

  const counts = useMemo(
    () => ({
      all: members.length,
      ACTIVE: members.filter((member) => member.status === 'ACTIVE').length,
      PENDING: members.filter((member) => member.status === 'PENDING').length,
      DEACTIVATED: members.filter((member) => member.status === 'DEACTIVATED').length,
    }),
    [members],
  );

  const filteredMembers = useMemo(
    () => (filter === 'all' ? members : members.filter((member) => member.status === filter)),
    [filter, members],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 px-4 pb-1">
        {FILTERS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            className={buildFilterClass(filter === key)}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
          >
            {t(labelKey, { count: counts[key] })}
          </button>
        ))}
        <Button asChild size="sm" className="ml-auto hidden lg:inline-flex">
          <Link href="/dashboard/team/invite">
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t('invite')}
          </Link>
        </Button>
      </div>

      {hasMore && (
        <p className="px-4 text-sm text-gray-500" data-testid="team-list-truncated-notice">
          {t('truncatedNotice')}
        </p>
      )}

      <Card className="overflow-hidden">
        {filteredMembers.length > 0 ? (
          <div className="divide-y divide-border">
            {filteredMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                isCurrentUser={member.id === currentStaffId}
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-10 text-center text-sm text-gray-500">{t('empty')}</div>
        )}
      </Card>

      <Button
        asChild
        size="icon"
        className="fixed bottom-20 right-6 z-20 h-14 w-14 rounded-full shadow-lg shadow-blue-600/35 lg:hidden"
      >
        <Link href="/dashboard/team/invite" aria-label={t('invite')}>
          <Plus className="h-6 w-6" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
