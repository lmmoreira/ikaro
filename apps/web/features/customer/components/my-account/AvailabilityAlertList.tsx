'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { AvailabilityAlertResponse, AvailabilityAlertStatus } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { cn } from '@/shared/utils/cn';
import {
  ALERT_STATUS_CLASSES,
  alertCancelPath,
  alertDetailPath,
  canCancelAlert,
  splitAlertSections,
} from '../../alert-model';
import { AccountListRow } from './AccountListRow';
import { useAlertText } from './use-alert-text';

interface AvailabilityAlertListProps {
  readonly alerts: readonly AvailabilityAlertResponse[];
  readonly tenantSlug: string;
}

const STATUS_LABEL_KEY = {
  ACTIVE: 'statusActive',
  NOTIFIED: 'statusNotified',
  EXPIRED: 'statusExpired',
  CANCELLED: 'statusExpired',
} as const satisfies Record<AvailabilityAlertStatus, string>;

interface AlertSectionProps {
  readonly testId: 'section-active' | 'section-history';
  readonly title: string;
  readonly items: readonly AvailabilityAlertResponse[];
  readonly tenantSlug: string;
}

function AlertSection({ testId, title, items, tenantSlug }: AlertSectionProps): React.JSX.Element {
  const t = useTranslations('customer.alerts');
  const text = useAlertText();

  return (
    <section data-testid={testId} className="mt-6 first:mt-0">
      <h2 className="text-sm font-semibold text-gray-500">{title}</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((alert) => {
          const terminal = !canCancelAlert(alert.status);
          const details = text.durationAndPeople(alert);
          const criteria = text.criteriaLine(alert);
          return (
            <AccountListRow
              key={alert.id}
              testId="alert-row"
              icon={
                <div
                  className={cn(
                    'flex h-[2.125rem] w-[2.125rem] shrink-0 items-center justify-center rounded-lg',
                    terminal ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-blue-600',
                  )}
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                </div>
              }
              title={text.title(alert)}
              href={alertDetailPath(tenantSlug, alert.id)}
              meta={[
                details === '' ? criteria : `${criteria} · ${details}`,
                text.statusLine(alert),
              ]}
              actions={
                canCancelAlert(alert.status) ? (
                  <Link
                    href={alertCancelPath(tenantSlug, alert.id)}
                    data-testid="cancel-alert-action"
                    className="font-medium text-red-600 hover:underline"
                  >
                    {t('cancelAction')}
                  </Link>
                ) : undefined
              }
              badge={
                <Badge
                  data-testid="alert-status-badge"
                  className={cn(
                    'shrink-0 border-0 px-2.5 py-1',
                    ALERT_STATUS_CLASSES[alert.status],
                  )}
                >
                  {t(STATUS_LABEL_KEY[alert.status])}
                </Badge>
              }
            />
          );
        })}
      </ul>
    </section>
  );
}

/**
 * "Meus avisos" (UC-076) — the customer's alerts, active ones first and the finished ones under
 * "Histórico". Management only: there is no create control (an alert is created from the booking
 * flow) and no edit.
 */
export function AvailabilityAlertList({
  alerts,
  tenantSlug,
}: AvailabilityAlertListProps): React.JSX.Element {
  const t = useTranslations('customer.alerts');
  const { active, history } = splitAlertSections(alerts);
  const isEmpty = active.length === 0 && history.length === 0;

  return (
    <div className="w-full" data-testid="alerts-list">
      <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>

      {isEmpty ? (
        <section
          data-testid="alerts-empty"
          className="mt-6 flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center shadow-sm"
        >
          <Bell className="h-10 w-10 text-gray-300" aria-hidden="true" />
          <p className="mt-4 text-base font-semibold text-gray-900">{t('emptyTitle')}</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">{t('emptyBody')}</p>
          <Link
            href={`/${tenantSlug}/booking`}
            data-testid="alerts-empty-cta"
            className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t('newBooking')}
          </Link>
        </section>
      ) : (
        <div className="mt-4">
          <p className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-sm text-blue-900">
            {t('notice')}
          </p>
          <div className="mt-4">
            {active.length > 0 && (
              <AlertSection
                testId="section-active"
                title={t('sectionActive', { count: active.length })}
                items={active}
                tenantSlug={tenantSlug}
              />
            )}
            {history.length > 0 && (
              <AlertSection
                testId="section-history"
                title={t('sectionHistory', { count: history.length })}
                items={history}
                tenantSlug={tenantSlug}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
