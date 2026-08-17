import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CustomerLoyaltyRedemptionsResponse } from '@ikaro/types';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { appendReturnTo } from '../../booking-navigation';

interface LoyaltyRedemptionsPanelProps {
  readonly redemptions: CustomerLoyaltyRedemptionsResponse;
  readonly tenantSlug: string;
}

export function LoyaltyRedemptionsPanel({
  redemptions,
  tenantSlug,
}: LoyaltyRedemptionsPanelProps): React.JSX.Element {
  const t = useTranslations('customer.loyalty');
  const { formatDate } = useFormatting();

  return (
    <ul
      id="loyalty-panel-redemptions"
      role="tabpanel"
      aria-labelledby="loyalty-tab-redemptions"
      className="mt-3 flex flex-col gap-2"
    >
      {redemptions.items.length === 0 ? (
        <li className="rounded-xl border border-gray-100 bg-white p-4 text-center text-sm text-gray-500">
          {t('noRedemptions')}
        </li>
      ) : (
        redemptions.items.map((redemption) => {
          const rowClassName =
            'flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4';
          const rowContent = (
            <>
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {redemption.bookingReference === null
                    ? t('redemptionLabelGeneric')
                    : t('redemptionLabel', { reference: redemption.bookingReference })}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  <span>{formatDate(new Date(redemption.redeemedAt))}</span>
                  <span>{t('savingsLabel', { amount: redemption.amountSaved })}</span>
                </div>
              </div>
              <span className="text-sm font-bold text-red-600">−{redemption.pointsUsed} pts</span>
            </>
          );

          return (
            <li key={redemption.redemptionId}>
              {redemption.bookingId === null ? (
                <div data-testid="loyalty-redemption-row" className={rowClassName}>
                  {rowContent}
                </div>
              ) : (
                <Link
                  href={appendReturnTo(
                    `/${tenantSlug}/my-account/bookings/${redemption.bookingId}`,
                    `/${tenantSlug}/my-account/loyalty`,
                  )}
                  data-testid="loyalty-redemption-row"
                  className={`${rowClassName} transition-colors hover:bg-gray-50`}
                >
                  {rowContent}
                </Link>
              )}
            </li>
          );
        })
      )}
    </ul>
  );
}
