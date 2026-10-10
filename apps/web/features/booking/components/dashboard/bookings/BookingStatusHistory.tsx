'use client';

import { useTranslations } from 'next-intl';
import type { BookingStatusHistoryEntry } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { buildBookingStatusLabels } from '@/features/booking/model/booking-status';

interface BookingStatusHistoryProps {
  readonly entries: readonly BookingStatusHistoryEntry[];
}

type Translate = ReturnType<typeof useTranslations<'dashboard.bookingDetail'>>;

const ACTOR_ROLE_KEYS = {
  MANAGER: 'actorRoleManager',
  STAFF: 'actorRoleStaff',
  CUSTOMER: 'actorRoleCustomer',
  GUEST: 'actorRoleGuest',
  SYSTEM: 'actorRoleSystem',
} as const satisfies Record<BookingStatusHistoryEntry['actorType'], string>;

// "Ana Pereira (Gerente)" when the backend resolved a name, otherwise just the role label.
function resolveActorLabel(entry: BookingStatusHistoryEntry, t: Translate): string {
  const role = t(ACTOR_ROLE_KEYS[entry.actorType]);
  return entry.actorName ? t('statusHistoryActorNamed', { name: entry.actorName, role }) : role;
}

// UC-074 (03d / 03f / 03g) — the booking's status changes, oldest first, from
// `booking_status_transitions`. The no-show's internal reason is shown here, to staff only.
export function BookingStatusHistory({ entries }: BookingStatusHistoryProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const { formatDate, formatTime } = useFormatting();
  const statusLabels = buildBookingStatusLabels(t);

  return (
    <section data-testid="booking-status-history">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
        {t('statusHistoryTitle')}
      </p>
      <Card>
        <CardContent className="p-4">
          <ol className="divide-y divide-gray-100">
            {entries.map((entry, index) => {
              const occurredAt = new Date(entry.occurredAt);
              return (
                <li
                  key={`${entry.occurredAt}-${index}`}
                  data-testid="booking-status-history-entry"
                  className="py-2.5 first:pt-0 last:pb-0"
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {t('statusHistoryTransition', {
                      from: statusLabels[entry.fromStatus],
                      to: statusLabels[entry.toStatus],
                    })}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {resolveActorLabel(entry, t)} ·{' '}
                    {t('statusHistoryWhen', {
                      date: formatDate(occurredAt),
                      time: formatTime(occurredAt),
                    })}
                    {entry.reason ? ` · ${t('statusHistoryReason', { reason: entry.reason })}` : ''}
                  </p>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}
