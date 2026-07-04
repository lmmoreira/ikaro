'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CustomerSearchListResponse } from '@ikaro/types';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { Badge } from '@/shared/components/ui/badge';
import { Card } from '@/shared/components/ui/card';
import { searchCustomers } from '@/features/customer/api';
import { cn } from '@/shared/utils/cn';
import { getInitials } from '@/shared/utils/initials';

const RECENT_LIMIT = 5;
const SEARCH_LIMIT = 20;
const SKELETON_ROW_KEYS = ['top', 'middle', 'bottom'] as const;
const AVATAR_FALLBACK_CLASSES = [
  'bg-blue-600',
  'bg-violet-600',
  'bg-cyan-600',
  'bg-amber-600',
  'bg-pink-600',
] as const;

function LoyaltySearchSkeleton(): React.JSX.Element {
  return (
    <Card className="overflow-hidden">
      <div className="space-y-0">
        {SKELETON_ROW_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center gap-3 border-b border-gray-100 px-4 py-4 last:border-b-0"
          >
            <div className="h-10 w-10 rounded-full bg-gray-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-gray-100" />
              <div className="h-3 w-52 rounded bg-gray-100" />
            </div>
            <div className="h-6 w-16 rounded-full bg-gray-100" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function LoyaltySearchEmptyState({
  title,
  body,
}: {
  readonly title: string;
  readonly body: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Search className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{body}</p>
    </div>
  );
}

function CustomerRow({
  customer,
  index,
  pointsBadge,
}: {
  readonly customer: CustomerSearchListResponse['items'][number];
  readonly index: number;
  readonly pointsBadge: (count: number) => string;
}): React.JSX.Element {
  const avatarClassName = AVATAR_FALLBACK_CLASSES[index % AVATAR_FALLBACK_CLASSES.length];

  return (
    <Link
      href={`/dashboard/loyalty/${customer.customerId}`}
      className="flex items-center gap-3 border-b border-gray-200 px-4 py-3.5 transition-colors hover:bg-gray-50 last:border-b-0"
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className={cn('text-xs font-bold text-white', avatarClassName)}>
          {getInitials(customer.name)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{customer.name}</p>
        <p className="truncate text-sm text-gray-500">{customer.email}</p>
      </div>

      <Badge
        className={cn(
          'shrink-0 border-0 px-3 py-1 text-xs font-bold',
          customer.currentPoints > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400',
        )}
      >
        {pointsBadge(customer.currentPoints)}
      </Badge>
    </Link>
  );
}

function LoyaltySearchResults({
  customers,
  isLoading,
  isError,
  isRecent,
  pointsBadge,
  t,
}: {
  readonly customers: CustomerSearchListResponse['items'];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly isRecent: boolean;
  readonly pointsBadge: (count: number) => string;
  readonly t: ReturnType<typeof useTranslations>;
}): React.JSX.Element {
  if (isLoading) {
    return <LoyaltySearchSkeleton />;
  }

  if (isError) {
    return <LoyaltySearchEmptyState title={t('searchErrorTitle')} body={t('searchErrorBody')} />;
  }

  if (customers.length > 0) {
    return (
      <Card className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-none">
        {customers.map((customer, index) => (
          <CustomerRow
            key={customer.customerId}
            customer={customer}
            index={index}
            pointsBadge={pointsBadge}
          />
        ))}
      </Card>
    );
  }

  if (isRecent) {
    return <LoyaltySearchEmptyState title={t('noCustomersTitle')} body={t('noCustomersBody')} />;
  }

  return <LoyaltySearchEmptyState title={t('noResultsTitle')} body={t('noResultsBody')} />;
}

export function LoyaltySearchPage(): React.JSX.Element {
  const t = useTranslations('dashboard.loyaltyPage');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [customers, setCustomers] = useState<CustomerSearchListResponse['items']>([]);
  const [resolvedSearch, setResolvedSearch] = useState<string | null>(null);
  const [errorSearch, setErrorSearch] = useState<string | null>(null);

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
      .catch(() => {
        if (!active) return;
        setCustomers([]);
        setResolvedSearch(debouncedSearch);
        setErrorSearch(debouncedSearch);
      });

    return () => {
      active = false;
    };
  }, [debouncedSearch]);

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
        isRecent={isRecent}
        pointsBadge={pointsBadge}
        t={t}
      />
    </section>
  );
}
