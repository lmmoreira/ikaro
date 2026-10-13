// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_CUSTOMER_SEARCH_LENGTH, useCustomerSearch } from './useCustomerSearch';

const mockSearchCustomers = vi.fn();

vi.mock('@/features/customer/api', () => ({
  searchCustomers: (...args: unknown[]) => mockSearchCustomers(...args),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const ANA = {
  customerId: 'c-1',
  name: 'Ana',
  email: 'ana@x.com',
  phone: '+5531',
  currentPoints: 0,
};

beforeEach(() => {
  mockSearchCustomers.mockReset();
  mockSearchCustomers.mockResolvedValue({ items: [ANA], total: 1 });
});

afterEach(() => vi.useRealTimers());

describe('useCustomerSearch', () => {
  it('lists the first page when nothing is typed', async () => {
    const { result } = renderHook(() => useCustomerSearch(''), { wrapper });

    await waitFor(() => expect(result.current.items).toEqual([ANA]));
    expect(mockSearchCustomers).toHaveBeenCalledWith(undefined);
    expect(result.current.term).toBe('');
    expect(result.current.tooShort).toBe(false);
  });

  it(`does not search a term shorter than ${MIN_CUSTOMER_SEARCH_LENGTH} characters`, async () => {
    const { result } = renderHook(() => useCustomerSearch('ana'), { wrapper });

    await waitFor(() => expect(result.current.items).toEqual([ANA]));
    expect(result.current.tooShort).toBe(true);
    expect(mockSearchCustomers).toHaveBeenCalledTimes(1);
    expect(mockSearchCustomers).toHaveBeenCalledWith(undefined);
  });

  it('searches the debounced term once it is long enough', async () => {
    const { result, rerender } = renderHook(({ term }) => useCustomerSearch(term), {
      wrapper,
      initialProps: { term: '' },
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender({ term: '  maria  ' });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    await waitFor(() => expect(mockSearchCustomers).toHaveBeenCalledWith('maria'));
    expect(result.current.term).toBe('maria');
    expect(result.current.tooShort).toBe(false);
  });

  it('reports a failed search and retries it', async () => {
    mockSearchCustomers.mockRejectedValueOnce(new Error('down'));
    const { result } = renderHook(() => useCustomerSearch(''), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.items).toEqual([ANA]));
    expect(result.current.isError).toBe(false);
  });
});
