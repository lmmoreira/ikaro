// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateService,
  useDeactivateService,
  useServices,
  useUpdateService,
} from './useServices';

vi.mock('@/lib/api/dashboard/services', () => ({
  listServices: vi.fn().mockResolvedValue({ items: [] }),
  createService: vi.fn().mockResolvedValue({ id: 'svc-1', name: 'Lavagem' }),
  updateService: vi.fn().mockResolvedValue({ id: 'svc-1', name: 'Lavagem Premium' }),
  deactivateService: vi.fn().mockResolvedValue({ id: 'svc-1', isActive: false }),
}));

vi.mock('@/lib/api/bff-client', () => ({
  getTenantId: vi.fn().mockReturnValue('t-1'),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useServices', () => {
  it('fetches service list', async () => {
    const { result } = renderHook(() => useServices(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(0);
  });
});

describe('useCreateService', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useCreateService(), { wrapper });
    act(() =>
      result.current.mutate({
        name: 'Lavagem',
        priceAmount: 80,
        durationMinutes: 60,
        loyaltyPointsValue: 10,
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useUpdateService', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useUpdateService(), { wrapper });
    act(() => result.current.mutate({ id: 'svc-1', body: { name: 'Lavagem Premium' } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useDeactivateService', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useDeactivateService(), { wrapper });
    act(() => result.current.mutate('svc-1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
