import { cn } from '@/shared/utils/cn';

export function formatShortDateLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}

export function HistoryTabs({
  activeTab,
  onChange,
  entriesLabel,
  redemptionsLabel,
}: {
  readonly activeTab: 'entries' | 'redemptions';
  readonly onChange: (tab: 'entries' | 'redemptions') => void;
  readonly entriesLabel: string;
  readonly redemptionsLabel: string;
}): React.JSX.Element {
  return (
    <div className="mb-4 flex border-b-2 border-gray-200">
      <button
        type="button"
        onClick={() => onChange('entries')}
        className={cn(
          'mb-[-2px] border-b-2 px-4 pb-3 pt-2 text-sm font-semibold transition-colors',
          activeTab === 'entries'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-400',
        )}
      >
        {entriesLabel}
      </button>
      <button
        type="button"
        onClick={() => onChange('redemptions')}
        className={cn(
          'mb-[-2px] border-b-2 px-4 pb-3 pt-2 text-sm font-semibold transition-colors',
          activeTab === 'redemptions'
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-400',
        )}
      >
        {redemptionsLabel}
      </button>
    </div>
  );
}

export function EntryIcon({ expired }: { readonly expired: boolean }): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        expired ? 'bg-gray-100 text-gray-400' : 'bg-emerald-100 text-emerald-700',
      )}
      aria-hidden="true"
    >
      {expired ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 8 2 12 6 16" />
          <line x1="22" y1="12" x2="2" y2="12" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="18 8 22 12 18 16" />
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly body: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        {icon}
      </div>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">{body}</p>
    </div>
  );
}

export function LoyaltyHistoryRow({
  icon,
  title,
  meta,
  link,
  points,
}: {
  readonly icon: React.ReactNode;
  readonly title: React.ReactNode;
  readonly meta: React.ReactNode;
  readonly link?: React.ReactNode;
  readonly points: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b border-gray-200 py-3.5 last:border-b-0">
      {icon}
      <div className="min-w-0 flex-1">
        {title}
        <div className="mt-0.5 text-xs text-gray-500">{meta}</div>
        {link}
      </div>
      {points}
    </div>
  );
}
