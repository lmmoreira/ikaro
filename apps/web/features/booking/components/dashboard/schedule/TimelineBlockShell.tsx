import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/shared/utils/cn';

interface TimelineBlockShellProps {
  readonly compact: boolean;
  readonly className: string;
  readonly style: CSSProperties;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly ariaLabel?: string;
  readonly testId?: string;
  readonly icon?: ReactNode;
  readonly title: string;
  readonly subtitle: string;
  readonly footer?: ReactNode;
  readonly trailing?: ReactNode;
  // Native hover tooltip + accessible name for a purely informational block (no href, no
  // onClick): that block renders as a non-focusable, non-clickable note instead of a button.
  readonly tooltip?: string;
}

// Extracted from SchedulePage (TD37-S5A) — the shared timeline-block shell (booking/opening/
// closure blocks all render through it) is a self-contained presentational component.
export function TimelineBlockShell({
  compact,
  className,
  style,
  href,
  onClick,
  ariaLabel,
  testId,
  icon,
  title,
  subtitle,
  footer,
  trailing,
  tooltip,
}: TimelineBlockShellProps): React.JSX.Element {
  const content = (
    <div className="flex h-full flex-col gap-1">
      {/* The trailing badge wraps under the title when the block is too narrow for both (two
          overlapping bookings share a day box), so the title keeps its room and is never squeezed
          out by the badge. A wide block keeps both on one row, badge at the right. */}
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 flex-1 basis-20 items-start gap-2">
          {icon}
          <div className="min-w-0">
            <p className={cn('truncate font-semibold', compact ? 'text-xs' : 'text-sm')}>{title}</p>
            <p className={cn('truncate opacity-80', compact ? 'text-[0.65rem]' : 'text-xs')}>
              {subtitle}
            </p>
          </div>
        </div>
        {trailing}
      </div>
      {footer}
    </div>
  );

  const shellClassName = cn(
    compact
      ? 'absolute overflow-hidden rounded-xl px-2 py-1.5 shadow-sm'
      : 'absolute overflow-hidden rounded-2xl px-3 py-2 shadow-sm',
    className,
  );

  if (href) {
    return (
      <Link
        href={href}
        className={shellClassName}
        style={style}
        aria-label={ariaLabel}
        data-testid={testId}
      >
        {content}
      </Link>
    );
  }

  if (!onClick) {
    return (
      <div
        role="note"
        className={shellClassName}
        style={style}
        title={tooltip}
        aria-label={tooltip}
        data-testid={testId}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={shellClassName}
      style={style}
      data-testid={testId}
    >
      {content}
    </button>
  );
}
