'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { searchCustomers } from '@/features/customer/api';
import { useTenant } from '@/providers/tenant-provider';

/** A term shorter than this is not searched: the list of customers stays as it was. */
export const MIN_CUSTOMER_SEARCH_LENGTH = 5;
const DEBOUNCE_MS = 300;

function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

/**
 * The staff customer chooser's search (UC-108): by name, e-mail or phone through
 * `GET /customers?search=`. With no term — or one too short to search — it lists the first page,
 * which the backend sorts by name (there is no recency order).
 */
export function useCustomerSearch(rawTerm: string) {
  const { tenantId } = useTenant();
  const trimmed = useDebounced(rawTerm.trim());
  const term = trimmed.length >= MIN_CUSTOMER_SEARCH_LENGTH ? trimmed : '';
  const query = useQuery({
    queryKey: ['customers', tenantId, 'search', term],
    queryFn: () => searchCustomers(term || undefined),
  });
  return {
    term,
    tooShort: rawTerm.trim().length > 0 && rawTerm.trim().length < MIN_CUSTOMER_SEARCH_LENGTH,
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    retry: () => void query.refetch(),
  };
}
