'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { BookingOutcomeActionRail } from '../BookingOutcomeActionRail';

interface NewBookingStepLayoutProps {
  readonly children: ReactNode;
  /** The right-hand summary (desktop only: mobile keeps just the action bar). */
  readonly summary: ReactNode;
  readonly onBack: (() => void) | null;
  readonly onNext: () => void;
  readonly nextDisabled?: boolean;
  readonly nextLabel?: string;
}

// The staff steps' frame: the step in the centre, the summary and the actions on the right, and
// the actions alone in a fixed bar on mobile — the dashboard convention of `servicos/02`, not the
// hotsite's centred wizard. Each step passes its own gate for "Continuar".
export function NewBookingStepLayout({
  children,
  summary,
  onBack,
  onNext,
  nextDisabled = false,
  nextLabel,
}: NewBookingStepLayoutProps): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.actions');

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-0">
      <div className="min-w-0 space-y-4">{children}</div>
      <BookingOutcomeActionRail desktopTop={summary}>
        <Card>
          <CardContent className="space-y-3 p-4">
            <Button
              type="button"
              className="w-full"
              disabled={nextDisabled}
              data-testid="step-next"
              onClick={onNext}
            >
              {nextLabel ?? t('next')}
            </Button>
            {onBack && (
              <Button
                type="button"
                data-testid="step-back"
                className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
                onClick={onBack}
              >
                {t('back')}
              </Button>
            )}
          </CardContent>
        </Card>
      </BookingOutcomeActionRail>
    </div>
  );
}
