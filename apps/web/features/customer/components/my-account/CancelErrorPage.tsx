'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { Card } from '@/shared/components/ui/card';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { digitsOnly } from '@/shared/utils/digits-only';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { OutcomePage } from './OutcomePage';

interface CancelErrorPageProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly tenantSlug: string;
  readonly whatsapp: string | null;
  /** Where the customer came from (e.g. a recurring schedule's page) — the back link returns there. */
  readonly returnTo?: string | null;
}

export function CancelErrorPage({
  booking,
  tenantSlug,
  whatsapp,
  returnTo = null,
}: CancelErrorPageProps): React.JSX.Element {
  const t = useTranslations('customer.cancelError');
  const { formatMoney, formatTime, formatDateLong } = useFormatting();
  const topbarStatus = useCustomerTopbarStatus();
  const setBookingStatus = topbarStatus?.setBookingStatus;
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;

  const serviceNames = booking.lines.map((line) => line.serviceName).join(', ');
  const scheduledAt = booking.scheduledAt === null ? null : new Date(booking.scheduledAt);
  const backHref = returnTo ?? `/${tenantSlug}/my-account/bookings/${booking.bookingId}`;
  const deadline = booking.cancellableUntil === null ? null : new Date(booking.cancellableUntil);

  useEffect(() => {
    setBookingStatus?.(booking.status);
    setBackHrefOverride?.(backHref);
    setBackLabelOverride?.(returnTo === null ? t('backToBooking') : t('backToSchedule'));
    return () => {
      setBookingStatus?.(null);
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [
    backHref,
    booking.status,
    returnTo,
    setBackHrefOverride,
    setBackLabelOverride,
    setBookingStatus,
    t,
    tenantSlug,
  ]);

  return (
    <OutcomePage
      message={
        <FeedbackMessage title={t('title')} testId="cancel-window-error">
          {t('body')}
          {deadline !== null && (
            <>
              <br />
              <br />
              {t('deadlineNote', {
                date: formatDateLong(deadline),
                time: formatTime(deadline),
              })}
            </>
          )}
        </FeedbackMessage>
      }
      primary={{ label: t('backButton'), href: backHref }}
      secondary={
        whatsapp === null
          ? undefined
          : {
              label: t('whatsappCta'),
              href: `https://wa.me/${digitsOnly(whatsapp)}`,
              external: true,
            }
      }
    >
      <Card className="rounded-xl border-gray-100 p-4 shadow-none">
        <p className="text-sm font-semibold text-gray-900">{serviceNames}</p>
        {scheduledAt !== null && (
          <p className="mt-1 text-sm text-gray-500">
            {formatDateLong(scheduledAt)} · {formatTime(scheduledAt)}
          </p>
        )}
        <p className="mt-1 text-sm font-medium text-gray-900">
          {formatMoney(booking.totalPrice.amount)}
        </p>
      </Card>

      <Card className="rounded-xl border-gray-100 p-4 shadow-none">
        <p className="text-sm leading-relaxed text-gray-800">{t('contactNote')}</p>
      </Card>
    </OutcomePage>
  );
}
