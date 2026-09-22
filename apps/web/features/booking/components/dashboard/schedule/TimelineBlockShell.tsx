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
}: TimelineBlockShellProps): React.JSX.Element {
  const content = (
    <div className="flex h-full flex-col gap-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
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
