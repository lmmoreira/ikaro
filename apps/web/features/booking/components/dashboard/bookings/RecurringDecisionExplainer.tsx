'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';

interface RecurringDecisionExplainerProps {
  readonly customerName: string;
  // The most reservations an approval can create (the request's term, counted from its pattern).
  readonly maxCount: number;
  // The hold has passed: approving is no longer possible, so its explanation is left out.
  readonly holdExpired: boolean;
}

// "O que acontece" (prototype 08): what approving and rejecting each do, for a request that can
// still be decided. Whether staff pick one is the screen's business, not this card's.
export function RecurringDecisionExplainer({
  customerName,
  maxCount,
  holdExpired,
}: RecurringDecisionExplainerProps): React.JSX.Element {
  const t = useTranslations('dashboard.recurringApproval');

  return (
    <div className="space-y-2" data-testid="recurring-what-happens">
      <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
        {t('whatHappens')}
      </p>
      <Card>
        <CardContent className="space-y-3 p-4 text-sm leading-6 text-gray-600">
          <p>{t('noneCreatedYet')}</p>
          <p>{t('decisionCoversAll')}</p>
          {holdExpired ? null : (
            <p>
              <strong className="text-gray-900">{t('approveLabel')}</strong>{' '}
              {t('approveExplain', { count: maxCount })}
            </p>
          )}
          <p>
            <strong className="text-gray-900">{t('rejectLabel')}</strong>{' '}
            {t('rejectExplain', { name: customerName })}
          </p>
          <p className="text-xs text-gray-500">{t('emailNotice', { name: customerName })}</p>
        </CardContent>
      </Card>
    </div>
  );
}
