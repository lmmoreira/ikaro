'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/shared/components/ui/card';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';
import { digitsOnly } from '@/shared/utils/digits-only';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import type { BookingWindowFacts } from '../../hooks/useDescribeBookingWindow';
import { OutcomePage } from './OutcomePage';
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
    <OutcomePage
      message={
        <FeedbackMessage title={t('windowTitle')} testId="reschedule-window-error">
          {t('windowBody', { hours: windowHours })}
          <br />
          <br />
          {t('windowDeadline')}
          <br />
          <strong>
            {formatDateLong(eligibleUntil)} · {formatTime(eligibleUntil)}
          </strong>
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
        <p className="mb-2 text-sm font-semibold text-gray-900">{t('currentSectionLabel')}</p>
        <RescheduleBookingFacts
          bare
          serviceNames={serviceNames}
          when={when}
          durationMins={durationMins}
          price={price}
        />
      </Card>

      <Card className="rounded-xl border-gray-100 p-4 shadow-none">
        <p className="mb-1 text-sm font-semibold text-gray-900">{t('contactTitle')}</p>
        <p className="text-sm leading-relaxed text-gray-800">{t('contactBody')}</p>
      </Card>
    </OutcomePage>
  );
}
