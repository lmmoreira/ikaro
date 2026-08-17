import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CustomerLoyaltyEntriesResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { appendReturnTo } from '../../booking-navigation';

interface LoyaltyEntriesPanelProps {
  readonly entries: CustomerLoyaltyEntriesResponse;
  readonly tenantSlug: string;
}

export function LoyaltyEntriesPanel({
  entries,
  tenantSlug,
}: LoyaltyEntriesPanelProps): React.JSX.Element {
  const t = useTranslations('customer.loyalty');
  const { formatDate } = useFormatting();

  return (
    <ul
      id="loyalty-panel-entries"
      role="tabpanel"
      aria-labelledby="loyalty-tab-entries"
      className="mt-3 flex flex-col gap-2"
    >
      {entries.items.map((entry) => (
        <li key={entry.entryId}>
          <Link
            href={appendReturnTo(
              `/${tenantSlug}/my-account/bookings/${entry.bookingId}`,
              `/${tenantSlug}/my-account/loyalty`,
            )}
            data-testid="loyalty-entry-row"
            className={`flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 transition-colors hover:bg-gray-50 ${
              entry.expired ? 'opacity-40' : ''
            }`}
          >
            <div>
              <p className="text-sm font-semibold text-gray-900">{entry.serviceName}</p>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                <span>{formatDate(new Date(entry.earnedAt))}</span>
                {entry.expired && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-500">
                    {t('expiredBadge')}
                  </span>
                )}
              </div>
            </div>
            <span
              className={`text-sm font-bold ${entry.expired ? 'text-gray-400' : 'text-green-600'}`}
            >
              +{entry.pointsEarned} pts
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
