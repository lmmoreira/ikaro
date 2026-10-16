// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStaffCustomer } from './useStaffCustomer';

const mockGetCustomerById = vi.fn();

vi.mock('@/features/customer/api', () => ({
  getCustomerById: (...args: unknown[]) => mockGetCustomerById(...args),
}));
vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useStaffCustomer', () => {
  it('reads the customer by id', async () => {
    mockGetCustomerById.mockResolvedValue({ customerId: 'c-1', name: 'Ana Costa' });

    const { result } = renderHook(() => useStaffCustomer('c-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetCustomerById).toHaveBeenCalledWith('c-1');
    expect(result.current.data?.name).toBe('Ana Costa');
  });

  it('does not fetch until it has an id', () => {
    renderHook(() => useStaffCustomer(undefined), { wrapper });

    expect(mockGetCustomerById).not.toHaveBeenCalled();
  });

  it('reports a failed read so the caller can fall back', async () => {
    mockGetCustomerById.mockRejectedValue(new Error('404'));

    const { result } = renderHook(() => useStaffCustomer('c-9'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
