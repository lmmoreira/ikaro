'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CustomerSearchListResponse } from '@ikaro/types';
import { searchCustomers } from '@/features/customer/api';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { LoyaltySearchResults } from './LoyaltySearchResults';

const RECENT_LIMIT = 5;
const SEARCH_LIMIT = 20;

export function LoyaltySearchPage(): React.JSX.Element {
  const t = useTranslations('dashboard.loyaltyPage');
  const locale = useResolvedLocale();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerSearchListResponse['items']>([]);
  const [resolvedSearch, setResolvedSearch] = useState<string | null>(null);
  const [errorSearch, setErrorSearch] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);
    return () => globalThis.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    let active = true;
    void searchCustomers(
      debouncedSearch || undefined,
      debouncedSearch ? SEARCH_LIMIT : RECENT_LIMIT,
    )
      .then((response) => {
        if (!active) return;
        setCustomers(response.items);
        setResolvedSearch(debouncedSearch);
        setErrorSearch(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setCustomers([]);
        setResolvedSearch(debouncedSearch);
        setErrorSearch(debouncedSearch);
        setErrorMessage(resolveErrorMessageFromApiError(err, locale));
      });

    return () => {
      active = false;
    };
  }, [debouncedSearch, locale]);

  const isLoading = resolvedSearch !== debouncedSearch;
  const isError = errorSearch === debouncedSearch;
  const isRecent = debouncedSearch.length === 0;
  const heading = isRecent ? t('recentCustomers') : t('resultsFor', { term: debouncedSearch });
  const pointsBadge = (count: number) => t('pointsBadge', { count });

  return (
    <section className="w-full space-y-0">
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="h-11 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-4 text-sm text-gray-900 shadow-none outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
      </div>

      <p className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-gray-400">{heading}</p>

      <LoyaltySearchResults
        customers={customers}
        isLoading={isLoading}
        isError={isError}
        errorMessage={errorMessage}
        isRecent={isRecent}
        pointsBadge={pointsBadge}
        t={t}
      />
    </section>
  );
}
