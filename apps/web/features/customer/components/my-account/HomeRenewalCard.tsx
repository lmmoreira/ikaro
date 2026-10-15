'use client';

import Link from 'next/link';
import { Repeat } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@/shared/components/ui/card';
import type { RenewalSelection } from '../../home-widgets';
import {
  recurringScheduleListPath,
  recurringScheduleRenewPath,
} from '../../recurring-schedule-model';
import { useRecurrenceText } from './use-recurrence-text';

interface HomeRenewalCardProps {
  readonly selection: RenewalSelection;
  readonly tenantSlug: string;
}

const BUTTON_CLASSES =
  'shrink-0 whitespace-nowrap rounded-lg bg-blue-600 px-3.5 py-2 text-[0.8125rem] font-semibold text-white hover:bg-blue-700';

/**
 * The amber prompt on the customer Início for a recurring reservation about to end: the one that
 * ends first with a "Renovar" button into the pre-filled renewal form, or — with several ending —
 * how many, with a button to the recurring list (one card at most, never a stack).
 */
export function HomeRenewalCard({
  selection,
  tenantSlug,
}: HomeRenewalCardProps): React.JSX.Element {
  const t = useTranslations('customer.home');
  const tSchedules = useTranslations('customer.recurringSchedules');
  const { recurrenceLine, termText } = useRecurrenceText();

  return (
    <Card
      data-testid="home-renewal-card"
      className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border-amber-200 bg-amber-50 px-4 py-3.5 shadow-none"
    >
      <Repeat className="h-[22px] w-[22px] shrink-0 text-amber-800" aria-hidden="true" />
      {selection.kind === 'one' ? (
        <>
          <div className="min-w-[12rem] flex-1">
            <p
              data-testid="home-renewal-title"
              className="text-[0.9375rem] font-bold text-gray-900"
            >
              {t('renewTitle', {
                service: selection.schedule.serviceName,
                days: selection.daysLeft,
              })}
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-gray-500">
              {`${recurrenceLine(selection.schedule.recurrence)} · ${termText(selection.schedule)}`}
            </p>
          </div>
          <Link
            href={recurringScheduleRenewPath(tenantSlug, selection.schedule.id)}
            data-testid="home-renewal-action"
            className={BUTTON_CLASSES}
          >
            {tSchedules('renewAction')}
          </Link>
        </>
      ) : (
        <>
          <div className="min-w-[12rem] flex-1">
            <p
              data-testid="home-renewal-title"
              className="text-[0.9375rem] font-bold text-gray-900"
            >
              {t('renewTitleMany', { count: selection.count })}
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-gray-500">
              {t('renewMetaMany', { days: selection.firstDaysLeft })}
            </p>
          </div>
          <Link
            href={recurringScheduleListPath(tenantSlug)}
            data-testid="home-renewal-action"
            className={BUTTON_CLASSES}
          >
            {t('renewViewAll')}
          </Link>
        </>
      )}
    </Card>
  );
}
