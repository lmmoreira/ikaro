import type { useTranslations } from 'next-intl';
import type { CustomerProfileResponse, EnrichedLoyaltyBalanceResponse } from '@ikaro/types';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/utils/cn';
import { getInitials } from '@/shared/utils/initials';

export function CustomerLoyaltyHeader({
  customer,
  balance,
  initialPoints,
  hasPoints,
  totalValue,
  nextExpiryLabel,
  balanceCardClassName,
  formatMoney,
  t,
}: {
  readonly customer: CustomerProfileResponse;
  readonly balance: EnrichedLoyaltyBalanceResponse;
  readonly initialPoints: number;
  readonly hasPoints: boolean;
  readonly totalValue: number;
  readonly nextExpiryLabel: string | null;
  readonly balanceCardClassName: string;
  readonly formatMoney: (amount: number) => string;
  readonly t: ReturnType<typeof useTranslations>;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <header className="flex items-center gap-4">
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarFallback className="bg-blue-600 text-sm font-bold text-white">
            {getInitials(customer.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold text-gray-900">{customer.name}</p>
          <p className="truncate text-sm text-gray-500">{customer.email}</p>
        </div>
      </header>

      <Card
        className={cn(
          'w-full max-w-md overflow-hidden rounded-2xl border-0 shadow-none lg:self-center',
          balanceCardClassName,
        )}
      >
        <div className="p-3.5 sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-3xl font-extrabold leading-none sm:text-[2.25rem]">
                {initialPoints}
              </p>
              <p
                data-testid="loyalty-balance-label"
                className="mt-1 text-xs font-medium uppercase tracking-[0.06em] opacity-80"
              >
                {hasPoints ? t('balanceLabelActive') : t('balanceLabelEmpty')}
              </p>
            </div>

            <div className="space-y-1.5 sm:max-w-[16rem] sm:text-right">
              {hasPoints && nextExpiryLabel && balance.nextExpiryPoints !== null && (
                <div className="inline-flex max-w-full items-start rounded-xl bg-white/15 px-2.5 py-1.5 text-left text-xs font-medium sm:ml-auto sm:text-sm">
                  <span className="mr-2 shrink-0">⚠️</span>
                  <span className="min-w-0">
                    {t('balanceExpiryLine', {
                      count: balance.nextExpiryPoints,
                      date: nextExpiryLabel,
                    })}
                  </span>
                </div>
              )}

              {hasPoints && balance.conversionRate > 0 && (
                <p className="text-xs font-medium opacity-90 sm:text-sm">
                  {t('balanceRateLine', {
                    pointsPerCurrencyUnit: balance.conversionRate,
                    price: formatMoney(1),
                    totalLabel: t('balanceTotalLabel'),
                    total: formatMoney(totalValue),
                  })}
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
