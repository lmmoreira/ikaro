// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCustomerProfile, useUpdateCustomerProfile } from './useCustomerProfile';

vi.mock('@/lib/api/dashboard/customers', () => ({
  getCustomerProfile: vi.fn().mockResolvedValue({
    customerId: 'c-1',
    email: 'maria@example.com',
    name: 'Maria',
    phone: null,
    defaultAddress: null,
  }),
  updateCustomerProfile: vi.fn().mockResolvedValue({
    customerId: 'c-1',
    email: 'maria@example.com',
    name: 'Maria',
    phone: '11999998888',
    defaultAddress: null,
  }),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useCustomerProfile', () => {
  it('fetches customer profile', async () => {
    const { result } = renderHook(() => useCustomerProfile(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.customerId).toBe('c-1');
  });
});

describe('useUpdateCustomerProfile', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useUpdateCustomerProfile(), { wrapper });
    act(() => result.current.mutate({ phone: '11999998888' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.phone).toBe('11999998888');
  });
});
