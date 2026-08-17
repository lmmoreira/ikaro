'use client';

import Link from 'next/link';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { BookingClientCard } from './BookingClientCard';
import { BookingOutcomeActionRail } from './BookingOutcomeActionRail';

type OutcomeTone = 'success' | 'danger' | 'info';

interface OutcomeAction {
  readonly label: string;
  readonly href: string;
}

interface BookingOutcomeLayoutProps {
  readonly booking: StaffBookingDetailResponse;
  readonly bannerTitle: string;
  readonly bannerBody: React.ReactNode;
  readonly asideBody: React.ReactNode;
  readonly primaryAction: OutcomeAction;
  readonly secondaryAction?: OutcomeAction;
  readonly tone?: OutcomeTone;
  readonly children?: React.ReactNode;
}

function getOutcomeBannerClass(tone: OutcomeTone): string {
  if (tone === 'success') return 'border-green-200 bg-green-50/80';
  if (tone === 'danger') return 'border-red-200 bg-red-50/80';
  return 'border-blue-200 bg-blue-50/80';
}

function getOutcomeIconClass(tone: OutcomeTone): string {
  if (tone === 'success') return 'bg-green-600';
  if (tone === 'danger') return 'bg-red-600';
  return 'bg-blue-600';
}

function getOutcomeTitleClass(tone: OutcomeTone): string {
  if (tone === 'success') return 'text-green-700';
  if (tone === 'danger') return 'text-red-700';
  return 'text-blue-700';
}

function getOutcomeBodyClass(tone: OutcomeTone): string {
  if (tone === 'success') return 'text-green-700/90';
  if (tone === 'danger') return 'text-red-700/90';
  return 'text-blue-700/90';
}

function OutcomeIcon({ tone }: { readonly tone: OutcomeTone }): React.JSX.Element {
  const backgroundClass = getOutcomeIconClass(tone);
  const strokeColor = 'white';
  const icon =
    tone === 'danger' ? (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ) : (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );

  return (
    <div
      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${backgroundClass}`}
    >
      {icon}
    </div>
  );
}

export function BookingOutcomeLayout({
  booking,
  bannerTitle,
  bannerBody,
  asideBody,
  primaryAction,
  secondaryAction,
  tone = 'success',
  children,
}: BookingOutcomeLayoutProps): React.JSX.Element {
  return (
    <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card className={getOutcomeBannerClass(tone)}>
            <CardContent className="flex items-start gap-3 p-4">
              <OutcomeIcon tone={tone} />
              <div className="min-w-0 flex-1">
                <p
                  data-testid="outcome-banner-title"
                  className={`text-sm font-bold uppercase tracking-[0.07em] ${getOutcomeTitleClass(tone)}`}
                >
                  {bannerTitle}
                </p>
                <div className={`mt-2 text-sm leading-6 ${getOutcomeBodyClass(tone)}`}>
                  {bannerBody}
                </div>
              </div>
            </CardContent>
          </Card>

          <BookingClientCard booking={booking} />

          {children}
        </div>

        <BookingOutcomeActionRail>
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm text-gray-600">{asideBody}</p>
              <Button asChild className="w-full">
                <Link href={primaryAction.href}>{primaryAction.label}</Link>
              </Button>
              {secondaryAction && (
                <Button
                  asChild
                  className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
                >
                  <Link href={secondaryAction.href}>{secondaryAction.label}</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </BookingOutcomeActionRail>
      </div>
    </div>
  );
}
