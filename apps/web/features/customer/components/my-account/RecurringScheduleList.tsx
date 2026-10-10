'use client';

import Link from 'next/link';
import { Repeat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RecurringBookingScheduleListItem, RecurringScheduleStatus } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/utils/cn';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import {
  RECURRING_SCHEDULE_STATUS_CLASSES,
  recurringScheduleDetailPath,
  recurringScheduleNewPath,
  splitRecurringScheduleSections,
} from '../../recurring-schedule-model';
import { NewReservationMenu } from '../NewReservationMenu';
import { AccountListRow } from './AccountListRow';
import { useRecurrenceText } from './use-recurrence-text';

interface RecurringScheduleListProps {
  readonly schedules: readonly RecurringBookingScheduleListItem[];
  readonly tenantSlug: string;
}

const STATUS_LABEL_KEY = {
  PENDING_APPROVAL: 'statusPending',
  ACTIVE: 'statusActive',
  ENDED: 'statusEnded',
  CANCELLED: 'statusCancelled',
} as const satisfies Record<RecurringScheduleStatus, string>;

interface ScheduleSectionProps {
  readonly testId: 'section-active' | 'section-pending' | 'section-ended';
  readonly title: string;
  readonly items: readonly RecurringBookingScheduleListItem[];
  readonly tenantSlug: string;
}

function ScheduleSection({
  testId,
  title,
  items,
  tenantSlug,
}: ScheduleSectionProps): React.JSX.Element {
  const t = useTranslations('customer.recurringSchedules');
  const { formatDate, formatTime } = useFormatting();
  const { recurrenceLine, termText, formatDateKey } = useRecurrenceText();

  function secondLine(schedule: RecurringBookingScheduleListItem): string | null {
    if (schedule.status === 'PENDING_APPROVAL' && schedule.approvalHoldExpiresAt !== null) {
      const until = new Date(schedule.approvalHoldExpiresAt);
      return t('holdNote', {
        until: t('holdUntil', { date: formatDate(until), time: formatTime(until) }),
      });
    }
    if (schedule.status === 'ENDED')
      return t('endedNote', { date: formatDateKey(schedule.endsOn) });
    if (schedule.status === 'CANCELLED') return t('cancelledNote');
    return null;
  }

  return (
    <section data-testid={testId} className="mt-6 first:mt-0">
      <h2 className="text-sm font-semibold text-gray-500">{title}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((schedule) => {
          const detail = secondLine(schedule);
          const terminal = schedule.status === 'ENDED' || schedule.status === 'CANCELLED';
          return (
            <AccountListRow
              key={schedule.id}
              testId="recurring-schedule-row"
              icon={
                <div
                  className={cn(
                    'flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-lg',
                    terminal ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600',
                  )}
                >
                  <Repeat className="h-4 w-4" aria-hidden="true" />
                </div>
              }
              title={schedule.serviceName}
              href={recurringScheduleDetailPath(tenantSlug, schedule.id)}
              meta={[
                `${recurrenceLine(schedule.recurrence)} · ${termText(schedule)}`,
                ...(detail === null ? [] : [detail]),
              ]}
              badge={
                <Badge
                  data-testid="recurring-schedule-status-badge"
                  className={cn(
                    'shrink-0 border-0 px-2.5 py-1',
                    RECURRING_SCHEDULE_STATUS_CLASSES[schedule.status],
                  )}
                >
                  {t(STATUS_LABEL_KEY[schedule.status])}
                </Badge>
              }
            />
          );
        })}
      </ul>
    </section>
  );
}

export function RecurringScheduleList({
  schedules,
  tenantSlug,
}: RecurringScheduleListProps): React.JSX.Element {
  const t = useTranslations('customer.recurringSchedules');
  const { active, pending, ended } = splitRecurringScheduleSections(schedules);
  const isEmpty = schedules.length === 0;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
        <div className="lg:hidden" data-testid="mobile-new-menu">
          <NewReservationMenu tenantSlug={tenantSlug} />
        </div>
      </div>

      {isEmpty ? (
        <section
          data-testid="recurring-schedules-empty"
          className="mt-6 flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center shadow-sm"
        >
          <Repeat className="h-10 w-10 text-gray-300" aria-hidden="true" />
          <p className="mt-4 text-base font-semibold text-gray-900">{t('emptyTitle')}</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">{t('emptyBody')}</p>
          <Link
            href={recurringScheduleNewPath(tenantSlug)}
            data-testid="recurring-schedules-empty-cta"
            className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('createCta')}
          </Link>
        </section>
      ) : (
        <div className="mt-4">
          {active.length > 0 && (
            <ScheduleSection
              testId="section-active"
              title={t('sectionActive', { count: active.length })}
              items={active}
              tenantSlug={tenantSlug}
            />
          )}
          {pending.length > 0 && (
            <ScheduleSection
              testId="section-pending"
              title={t('sectionPending', { count: pending.length })}
              items={pending}
              tenantSlug={tenantSlug}
            />
          )}
          {ended.length > 0 && (
            <ScheduleSection
              testId="section-ended"
              title={t('sectionEnded', { count: ended.length })}
              items={ended}
              tenantSlug={tenantSlug}
            />
          )}
          <p className="mt-5 text-xs text-gray-400">{t('listFootnote')}</p>
        </div>
      )}
    </div>
  );
}
