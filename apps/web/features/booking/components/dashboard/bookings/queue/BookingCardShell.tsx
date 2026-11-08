import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/shared/components/ui/card';

interface BookingCardShellProps {
  // The whole card is a link to the booking detail; the leading control and the actions sit above
  // it (z-20) so clicking them never opens the detail.
  readonly href: string;
  readonly linkAriaLabel: string;
  readonly name: string;
  // A control drawn before the name (the worklist's checkbox).
  readonly leading?: ReactNode;
  // The pills on the right of the name row.
  readonly badges: ReactNode;
  readonly serviceLine: string;
  readonly timeLabel: string;
  readonly priceLabel: string;
  // Extra lines between the time/price row and the actions.
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}

// The queue card's layout, in one place: name + pills, service line, time left and price right,
// small buttons below. BookingCard (the Agenda queue) and SchedulingExceptionRow (the "Reservas a
// resolver" worklist) both render through it, so the two cannot drift apart.
export function BookingCardShell({
  href,
  linkAriaLabel,
  name,
  leading,
  badges,
  serviceLine,
  timeLabel,
  priceLabel,
  children,
  actions,
  className,
}: BookingCardShellProps): React.JSX.Element {
  const nameText = <span className="truncate text-sm font-semibold text-gray-900">{name}</span>;

  return (
    <div className="relative">
      <Link href={href} className="absolute inset-0 z-10" aria-label={linkAriaLabel} />
      <Card className={className}>
        <CardContent className="p-4">
          <div className="mb-1 flex items-start justify-between gap-2">
            {leading ? (
              <span className="flex min-w-0 items-center gap-2">
                <span className="relative z-20 flex shrink-0">{leading}</span>
                {nameText}
              </span>
            ) : (
              nameText
            )}
            <div className="flex shrink-0 flex-wrap justify-end gap-2">{badges}</div>
          </div>

          <p className="mb-1 truncate text-xs text-gray-500">{serviceLine}</p>

          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>{timeLabel}</span>
            <span>{priceLabel}</span>
          </div>

          {children}

          {actions ? <div className="relative z-20 mt-3 flex gap-2">{actions}</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
