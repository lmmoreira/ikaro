'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CustomerSearchItem } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import {
  MIN_CUSTOMER_SEARCH_LENGTH,
  useCustomerSearch,
} from '@/features/booking/hooks/useCustomerSearch';
import { resourceInitials } from '@/features/booking/model/resource-picker-copy';
import { INPUT_CLASS, LABEL_CLASS } from './new-booking/new-booking-styles';

interface CustomerSearchPanelProps {
  readonly selectedId: string | null;
  readonly onSelect: (customerId: string) => void;
}

function CustomerRow({
  customer,
  selected,
  onSelect,
}: {
  readonly customer: CustomerSearchItem;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.chooser');
  return (
    <li>
      <label
        data-testid="customer-row"
        data-customer-id={customer.customerId}
        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
          selected ? 'border-blue-500 bg-blue-50/60' : 'border-gray-200 bg-white hover:bg-gray-50'
        }`}
      >
        <input
          type="radio"
          name="chosen-customer"
          className="sr-only"
          checked={selected}
          onChange={onSelect}
        />
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700"
        >
          {resourceInitials(customer.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-gray-900">
            {customer.name}
          </span>
          <span className="block truncate text-xs text-gray-500">
            {customer.email} · {customer.phone ?? t('noPhone')}
          </span>
        </span>
      </label>
    </li>
  );
}

// "Cliente cadastrado": the tenant's customers by name, e-mail or phone (UC-108). The 5-character
// minimum applies only once a term is typed; with none, the first page is listed.
export function CustomerSearchPanel({
  selectedId,
  onSelect,
}: CustomerSearchPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.chooser');
  const [term, setTerm] = useState('');
  const search = useCustomerSearch(term);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="customer-search" className={LABEL_CLASS}>
          {t('searchLabel')}
        </label>
        <input
          id="customer-search"
          type="search"
          data-testid="customer-search"
          className={INPUT_CLASS}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t('searchPlaceholder')}
        />
        <p className="mt-1 text-xs text-gray-500">
          {t('searchHint', { min: MIN_CUSTOMER_SEARCH_LENGTH })}
        </p>
      </div>

      {search.isError && (
        <Card className="border-red-200 bg-red-50/80" data-testid="customer-search-error">
          <CardContent className="flex items-center justify-between gap-3 p-4 text-sm text-red-700">
            <span>{t('searchError')}</span>
            <Button type="button" variant="outline" size="sm" onClick={search.retry}>
              {t('retry')}
            </Button>
          </CardContent>
        </Card>
      )}

      {!search.isError && (
        <>
          <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
            {search.term ? t('resultsHeading') : t('listHeading')}
          </p>
          {!search.isLoading && search.items.length === 0 && (
            <p className="text-sm text-gray-600" data-testid="customer-no-result">
              {search.term ? t('noResult', { term: search.term }) : t('empty')}
            </p>
          )}
          <ul className="space-y-2" data-testid="customer-list">
            {search.items.map((customer) => (
              <CustomerRow
                key={customer.customerId}
                customer={customer}
                selected={selectedId === customer.customerId}
                onSelect={() => onSelect(customer.customerId)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
