// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecurringResourceOptions } from './useRecurringResourceOptions';

const fetchServiceResourceOptions = vi.hoisted(() => vi.fn());
vi.mock('@/features/booking/api/public', () => ({ fetchServiceResourceOptions }));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useRecurringResourceOptions', () => {
  it("returns the first requirement's options for the tenant and service", async () => {
    fetchServiceResourceOptions.mockResolvedValue({
      requirements: [
        {
          serviceId: 'svc-1',
          legIndex: null,
          resourceType: 'ROOM',
          selectionMode: 'CUSTOMER_CHOICE',
          requiredQuantity: 1,
          options: [{ resourceId: 'room-a', name: 'Sala Aurora' }],
        },
      ],
    });

    const { result } = renderHook(() => useRecurringResourceOptions('lavacar-bh', 'svc-1', true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ resourceId: 'room-a', name: 'Sala Aurora' }]);
    expect(fetchServiceResourceOptions).toHaveBeenCalledWith('lavacar-bh', 'svc-1');
  });

  it('is an empty list for a service with no customer-chosen requirement', async () => {
    fetchServiceResourceOptions.mockResolvedValue({ requirements: [] });

    const { result } = renderHook(() => useRecurringResourceOptions('lavacar-bh', 'svc-1', true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('does not ask while it is disabled', () => {
    renderHook(() => useRecurringResourceOptions('lavacar-bh', 'svc-1', false), { wrapper });
    expect(fetchServiceResourceOptions).not.toHaveBeenCalled();
  });
});
