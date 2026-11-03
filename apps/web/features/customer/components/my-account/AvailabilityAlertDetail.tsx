'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { AvailabilityAlertResponse, AvailabilityAlertStatus } from '@ikaro/types';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
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
import { DetailSection } from './DetailSection';
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
    <DetailSection title={label}>
      <div>{children}</div>
    </DetailSection>
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

  const backLink = (
    <Button asChild variant="outline" className="w-full">
      <Link href={listHref}>{t('backButton')}</Link>
    </Button>
  );
  const paneActions = (
    <>
      {cancellable ? (
        <>
          <p className="text-sm leading-relaxed text-gray-500">
            {t('activeAside')}
            <br />
            <strong className="text-gray-900">{formatDate(expiresAt)}</strong>
          </p>
          <Button asChild variant="destructive" className="w-full">
            <Link href={alertCancelPath(tenantSlug, alert.id)} data-testid="cancel-alert-link">
              {t('cancelAction')}
            </Link>
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-gray-500">{t('historyAside')}</p>
          <Button asChild className="w-full">
            <Link href={`/${tenantSlug}/booking`} data-testid="alert-new-booking">
              {t('newBookingButton')}
            </Link>
          </Button>
        </>
      )}
      {backLink}
    </>
  );
  const paneMobileActions = (
    <div className="grid auto-cols-fr grid-flow-col gap-3">
      {backLink}
      {cancellable ? (
        <Button asChild variant="destructive" className="w-full">
          <Link href={alertCancelPath(tenantSlug, alert.id)} data-testid="cancel-alert-link">
            {t('cancelAction')}
          </Link>
        </Button>
      ) : (
        <Button asChild className="w-full">
          <Link href={`/${tenantSlug}/booking`} data-testid="alert-new-booking">
            {t('newBookingButton')}
          </Link>
        </Button>
      )}
    </div>
  );

  return (
    <div className="w-full pb-40 lg:pb-0" data-testid="alert-detail">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <Card className="flex items-start justify-between gap-3 rounded-xl border-gray-100 p-4 shadow-none">
            <h1 className="min-w-0 text-lg font-bold text-gray-900">{alert.serviceName}</h1>
            <Badge
              data-testid="alert-status-badge"
              className={cn('shrink-0 border-0 px-3 py-1.5', ALERT_STATUS_CLASSES[alert.status])}
            >
              {t(STATUS_LABEL_KEY[alert.status])}
            </Badge>
          </Card>

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
        </div>

        <ActionPane actions={paneActions} mobileActions={paneMobileActions} />
      </div>
    </div>
  );
}
