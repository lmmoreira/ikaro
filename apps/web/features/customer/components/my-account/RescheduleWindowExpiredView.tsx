'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { digitsOnly } from '@/shared/utils/digits-only';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import type { BookingWindowFacts } from '../../hooks/useDescribeBookingWindow';
import { RescheduleBookingFacts } from './RescheduleBookingFacts';

interface RescheduleWindowExpiredViewProps {
  readonly serviceNames: string;
  readonly when: BookingWindowFacts;
  readonly durationMins: number;
  readonly price: number;
  readonly eligibleUntil: Date;
  readonly windowHours: number;
  readonly whatsapp: string | null;
  readonly backHref: string;
}

export function RescheduleWindowExpiredView({
  serviceNames,
  when,
  durationMins,
  price,
  eligibleUntil,
  windowHours,
  whatsapp,
  backHref,
}: RescheduleWindowExpiredViewProps): React.JSX.Element {
  const t = useTranslations('customer.reschedule');
  const { formatDateLong, formatTime } = useFormatting();

  return (
    <div className="flex w-full flex-col gap-4">
      <div
        role="alert"
        data-testid="reschedule-window-error"
        className="rounded-xl border border-red-200 bg-red-50 p-4"
      >
        <p className="mb-2 text-base font-extrabold text-red-700">🚫 {t('windowTitle')}</p>
        <p className="mb-3 text-sm leading-relaxed text-red-900">
          {t('windowBody', { hours: windowHours })}
        </p>
        <div className="rounded-md border border-red-200 bg-white px-3 py-2.5 text-sm text-red-800">
          {t('windowDeadline')}
          <br />
          <strong>
            {formatDateLong(eligibleUntil)} · {formatTime(eligibleUntil)}
          </strong>
        </div>
      </div>

      <div>
        <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
          {t('currentSectionLabel')}
        </p>
        <RescheduleBookingFacts
          serviceNames={serviceNames}
          when={when}
          durationMins={durationMins}
          price={price}
        />
      </div>

      <div className="rounded-xl bg-blue-50 px-4 py-3.5 text-sm leading-relaxed text-gray-800">
        <p className="mb-1 font-bold">{t('contactTitle')}</p>
        {t('contactBody')}
      </div>

      <Link
        href={backHref}
        className="rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-blue-700"
      >
        {t('backButton')}
      </Link>
      {whatsapp !== null && (
        <a
          href={`https://wa.me/${digitsOnly(whatsapp)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          {t('whatsappCta')}
        </a>
      )}
    </div>
  );
}
