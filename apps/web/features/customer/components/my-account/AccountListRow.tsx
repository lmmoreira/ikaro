import Link from 'next/link';

interface AccountListRowProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  /** The title is the link to the item's page. */
  readonly href: string;
  readonly meta: readonly string[];
  /** Small inline text actions under the meta lines (e.g. "Pular", "Reagendar"). */
  readonly actions?: React.ReactNode;
  /** The status badge on the right. */
  readonly badge: React.ReactNode;
  readonly testId?: string;
}

/**
 * One row of a "Minha Conta" list — icon, title link, muted meta, optional inline actions and a
 * status badge. Same shape as a booking row (`BookingListItem`), which can adopt it later.
 */
export function AccountListRow({
  icon,
  title,
  href,
  meta,
  actions,
  badge,
  testId,
}: AccountListRowProps): React.JSX.Element {
  return (
    <li
      data-testid={testId}
      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
    >
      {icon}
      <div className="min-w-0 flex-1">
        <Link
          href={href}
          className="block truncate text-sm font-semibold text-gray-900 hover:underline"
        >
          {title}
        </Link>
        {meta.map((line) => (
          <p key={line} className="mt-0.5 text-xs text-gray-500">
            {line}
          </p>
        ))}
        {actions !== undefined && (
          <div className="mt-1.5 flex items-center gap-3 text-xs">{actions}</div>
        )}
      </div>
      {badge}
    </li>
  );
}
