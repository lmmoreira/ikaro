'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { BookingStatusBannerIcon, type BannerVariant } from './BookingStatusBannerIcon';

export type BookingNoShowActionState =
  | 'no-show'
  | 'no-show-terminal'
  | 'no-show-not-ended'
  | 'no-show-error'
  | 'corrected'
  | 'correct-error'
  | 'correct-forbidden';

export function isBookingNoShowActionState(state: string): state is BookingNoShowActionState {
  return (
    state === 'no-show' ||
    state === 'no-show-terminal' ||
    state === 'no-show-not-ended' ||
    state === 'no-show-error' ||
    state === 'corrected' ||
    state === 'correct-error' ||
    state === 'correct-forbidden'
  );
}

interface BookingNoShowBannerProps {
  readonly actionState: BookingNoShowActionState;
  readonly booking: StaffBookingDetailResponse;
  // The appointment's end time in the tenant timezone (the 422 banner names it).
  readonly noShowEndLabel: string;
  // Loyalty points the correction awarded; null for a guest booking.
  readonly correctionPoints: number | null;
  readonly onRefresh: () => void;
  readonly onRetryNoShow: () => void;
  readonly onRetryCorrect: () => void;
}

// Whole class names, never built from a fragment, so Tailwind's scanner sees every one.
const TONES = {
  violet: {
    card: 'border-violet-200 bg-violet-50/80',
    title: 'text-violet-700',
    body: 'text-violet-700/90',
    icon: 'info',
  },
  amber: {
    card: 'border-amber-200 bg-amber-50/80',
    title: 'text-amber-800',
    body: 'text-amber-800/90',
    icon: 'info',
  },
  red: {
    card: 'border-red-200 bg-red-50/80',
    title: 'text-red-700',
    body: 'text-red-700/90',
    icon: 'danger',
  },
  green: {
    card: 'border-green-200 bg-green-50/80',
    title: 'text-green-700',
    body: 'text-green-700/90',
    icon: 'success',
  },
} as const satisfies Record<
  string,
  { card: string; title: string; body: string; icon: BannerVariant }
>;

interface BannerShellProps {
  readonly tone: keyof typeof TONES;
  readonly testId: string;
  readonly title: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
}

function BannerShell({
  tone,
  testId,
  title,
  children,
  action,
}: BannerShellProps): React.JSX.Element {
  const styles = TONES[tone];

  return (
    <Card className={styles.card} data-testid={testId}>
      <CardContent className="flex items-start gap-3 p-4">
        <BookingStatusBannerIcon variant={styles.icon} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold uppercase tracking-[0.07em] ${styles.title}`}>{title}</p>
          <div className={`mt-2 space-y-2 text-sm leading-6 ${styles.body}`}>{children}</div>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// UC-074 outcome banners (03c #rejeitado, 03d, 03e #terminal/#falha, 03g #sucesso/#falha/#permissao).
// Every failure banner means the booking was left unchanged.
export function BookingNoShowBanner({
  actionState,
  booking,
  noShowEndLabel,
  correctionPoints,
  onRefresh,
  onRetryNoShow,
  onRetryCorrect,
}: BookingNoShowBannerProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');
  const services = booking.lines.map((line) => line.serviceName).join(', ');

  switch (actionState) {
    case 'no-show':
      return (
        <BannerShell tone="violet" testId="booking-no-show-marked" title={t('noShowMarkedTitle')}>
          <p>{t('noShowMarkedBody', { name: booking.contactName })}</p>
          <p>{t('noShowMarkedNote')}</p>
        </BannerShell>
      );
    case 'no-show-not-ended':
      return (
        <BannerShell tone="red" testId="booking-no-show-not-ended" title={t('noShowNotEndedTitle')}>
          <p>{t('noShowNotEndedBody', { time: noShowEndLabel })}</p>
        </BannerShell>
      );
    case 'no-show-terminal':
      return (
        <BannerShell
          tone="amber"
          testId="booking-no-show-terminal"
          title={t('noShowTerminalTitle')}
          action={
            <Button type="button" onClick={onRefresh}>
              {t('noShowRefresh')}
            </Button>
          }
        >
          <p>{t('noShowTerminalBody')}</p>
        </BannerShell>
      );
    case 'no-show-error':
      return (
        <BannerShell
          tone="red"
          testId="booking-no-show-error"
          title={t('noShowErrorTitle')}
          action={
            <Button type="button" onClick={onRetryNoShow}>
              {t('noShowRetry')}
            </Button>
          }
        >
          <p>{t('noShowErrorBody')}</p>
        </BannerShell>
      );
    case 'corrected':
      return (
        <BannerShell tone="green" testId="booking-no-show-corrected" title={t('correctedTitle')}>
          <p>
            {correctionPoints === null
              ? t('correctedBody')
              : t('correctedBodyPoints', {
                  name: booking.contactName,
                  points: correctionPoints,
                  services,
                })}
          </p>
        </BannerShell>
      );
    case 'correct-forbidden':
      return (
        <BannerShell
          tone="red"
          testId="booking-no-show-correct-forbidden"
          title={t('correctForbiddenTitle')}
        >
          <p>{t('correctForbiddenBody')}</p>
        </BannerShell>
      );
    case 'correct-error':
      return (
        <BannerShell
          tone="red"
          testId="booking-no-show-correct-error"
          title={t('correctErrorTitle')}
          action={
            <Button type="button" onClick={onRetryCorrect}>
              {t('noShowRetry')}
            </Button>
          }
        >
          <p>{t('correctErrorBody')}</p>
        </BannerShell>
      );
  }
}
