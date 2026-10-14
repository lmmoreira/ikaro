'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { AvailabilityAlertResponse, AvailabilityAlertStatus } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { cn } from '@/shared/utils/cn';
import {
  ALERT_STATUS_CLASSES,
  alertCancelPath,
  alertListPath,
  canCancelAlert,
} from '../../alert-model';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { useAlertText } from './use-alert-text';

interface AvailabilityAlertDetailProps {
  readonly alert: AvailabilityAlertResponse;
  readonly tenantSlug: string;
}

const STATUS_LABEL_KEY = {
  ACTIVE: 'statusActive',
  NOTIFIED: 'statusNotified',
  EXPIRED: 'statusExpired',
  CANCELLED: 'statusExpired',
} as const satisfies Record<AvailabilityAlertStatus, string>;

interface DetailRowProps {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
}

function DetailRow({ label, value, sub }: DetailRowProps): React.JSX.Element {
  return (
    <div className="border-b border-gray-100 py-3 last:border-b-0">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium text-gray-900">{value}</p>
      {sub !== undefined && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

interface SectionProps {
  readonly label: string;
  readonly children: React.ReactNode;
}

function Section({ label, children }: SectionProps): React.JSX.Element {
  return (
    <div>
      <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
        {label}
      </p>
      <div className="rounded-xl border border-gray-100 bg-white px-4">{children}</div>
    </div>
  );
}

/**
 * One alert (UC-076): the service, when the customer wants to be told, and how long it stays
 * active — or, once notified or expired, what happened. An active alert offers "Cancelar aviso";
 * a finished one is read-only history.
 */
export function AvailabilityAlertDetail({
  alert,
  tenantSlug,
}: AvailabilityAlertDetailProps): React.JSX.Element {
  const t = useTranslations('customer.alerts');
  const { formatDate, formatTime } = useFormatting();
  const text = useAlertText();
  const topbarStatus = useCustomerTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;
  const listHref = alertListPath(tenantSlug);
  const cancellable = canCancelAlert(alert.status);

  useEffect(() => {
    setBackHrefOverride?.(listHref);
    setBackLabelOverride?.(t('backToList'));
    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [listHref, setBackHrefOverride, setBackLabelOverride, t]);

  const isRange = alert.criteriaType === 'ONE_TIME_RANGE';
  const expiresAt = new Date(alert.expiresAt);

  function validityRow(): React.JSX.Element {
    if (alert.status === 'ACTIVE') {
      return <DetailRow label={t('labelActiveUntil')} value={formatDate(expiresAt)} />;
    }
    if (alert.status === 'NOTIFIED') {
      if (alert.notifiedAt === null) {
        return <DetailRow label={t('labelNotifiedAt')} value={t('notified')} />;
      }
      const notifiedAt = new Date(alert.notifiedAt);
      return (
        <DetailRow
          label={t('labelNotifiedAt')}
          value={t('notifiedAtValue', {
            date: formatDate(notifiedAt),
            time: formatTime(notifiedAt),
          })}
          sub={t('notifiedViaEmail')}
        />
      );
    }
    return <DetailRow label={t('labelExpiredOn')} value={formatDate(expiresAt)} />;
  }

  function renderActionPane(): React.JSX.Element {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-white p-4">
        {cancellable ? (
          <>
            <p className="mb-1 text-sm leading-relaxed text-gray-500">
              {t('activeAside')}
              <br />
              <strong className="text-gray-900">{formatDate(expiresAt)}</strong>
            </p>
            <Link
              href={alertCancelPath(tenantSlug, alert.id)}
              data-testid="cancel-alert-link"
              className="rounded-lg border-2 border-red-600 bg-red-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:opacity-90"
            >
              {t('cancelAction')}
            </Link>
          </>
        ) : (
          <>
            <p className="mb-1 text-sm leading-relaxed text-gray-500">{t('historyAside')}</p>
            <Link
              href={`/${tenantSlug}/booking`}
              data-testid="alert-new-booking"
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t('newBookingButton')}
            </Link>
          </>
        )}
        <Link
          href={listHref}
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          {t('backButton')}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full" data-testid="alert-detail">
      <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 text-lg font-bold text-gray-900">{alert.serviceName}</h1>
            <Badge
              data-testid="alert-status-badge"
              className={cn('shrink-0 border-0 px-3 py-1.5', ALERT_STATUS_CLASSES[alert.status])}
            >
              {t(STATUS_LABEL_KEY[alert.status])}
            </Badge>
          </div>

          <Section label={t('sectionService')}>
            <DetailRow label={t('labelService')} value={alert.serviceName} />
            {alert.preferredResourceName !== null && (
              <DetailRow label={t('labelResource')} value={alert.preferredResourceName} />
            )}
            {alert.durationMinutes !== null && (
              <DetailRow label={t('labelDuration')} value={formatDuration(alert.durationMinutes)} />
            )}
          </Section>

          <Section label={t('sectionWhen')}>
            <DetailRow
              label={t('labelCriteria')}
              value={isRange ? t('criteriaRange') : t('criteriaWeekly')}
            />
            <DetailRow
              label={isRange ? t('labelPeriod') : t('labelDays')}
              value={text.criteriaLine(alert)}
              sub={text.timezoneName(alert)}
            />
          </Section>

          <Section label={t('sectionValidity')}>
            {validityRow()}
            <DetailRow label={t('labelCreated')} value={formatDate(new Date(alert.createdAt))} />
          </Section>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-sm leading-relaxed text-blue-900">
            {t('infoBox')}
          </div>

          <div data-testid="action-pane-mobile" className="lg:hidden">
            {renderActionPane()}
          </div>
        </div>

        <div data-testid="action-pane-desktop" className="hidden lg:sticky lg:top-6 lg:block">
          {renderActionPane()}
        </div>
      </div>
    </div>
  );
}
