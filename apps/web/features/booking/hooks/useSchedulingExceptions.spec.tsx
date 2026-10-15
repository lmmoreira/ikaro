// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OPEN_COUNT_STALE_TIME_MS,
  useOpenSchedulingExceptions,
  useOpenSchedulingExceptionsCount,
  useResolveSchedulingExceptions,
} from './useSchedulingExceptions';

const mockList = vi.fn();
const mockCount = vi.fn();
const mockResolve = vi.fn();
const tenant = vi.hoisted(() => ({
  value: { tenantId: 't-1', tenantSlug: 'lavacar', role: 'MANAGER' as 'MANAGER' | 'STAFF' },
}));

vi.mock('@/features/booking/api/scheduling-exceptions', () => ({
  listOpenSchedulingExceptions: () => mockList(),
  countOpenSchedulingExceptions: () => mockCount(),
  resolveSchedulingExceptions: (body: unknown) => mockResolve(body),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => tenant.value,
}));

function makeClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { readonly children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tenant.value = { tenantId: 't-1', tenantSlug: 'lavacar', role: 'MANAGER' };
  mockList.mockResolvedValue({ items: [] });
  mockCount.mockResolvedValue(3);
  mockResolve.mockResolvedValue({ results: [{ exceptionId: 'e1', outcome: 'RESOLVED' }] });
});

describe('useOpenSchedulingExceptions', () => {
  it('fetches the open list under a key that carries the tenant', async () => {
    const client = makeClient();
    const { result } = renderHook(() => useOpenSchedulingExceptions(), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockList).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['scheduling-exceptions', 't-1', 'list'])).toEqual({ items: [] });
  });
});

describe('useOpenSchedulingExceptionsCount', () => {
  it('fetches the count for a MANAGER, cached for a minute, under a tenant-scoped key', async () => {
    const client = makeClient();
    const { result } = renderHook(() => useOpenSchedulingExceptionsCount(), {
      wrapper: wrapperFor(client),
    });

    await waitFor(() => expect(result.current.data).toBe(3));

    expect(OPEN_COUNT_STALE_TIME_MS).toBe(60_000);
    expect(client.getQueryData(['scheduling-exceptions', 't-1', 'count'])).toBe(3);
    expect(mockList).not.toHaveBeenCalled(); // the badge never pulls the list
  });

  it('never fires for a STAFF user: the route is manager-only', async () => {
    tenant.value = { tenantId: 't-1', tenantSlug: 'lavacar', role: 'STAFF' };
    const { result } = renderHook(() => useOpenSchedulingExceptionsCount(), {
      wrapper: wrapperFor(makeClient()),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockCount).not.toHaveBeenCalled();
  });
});

describe('useResolveSchedulingExceptions', () => {
  it('resolves in batches and refreshes the worklist, its count, the bookings and the day grid', async () => {
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useResolveSchedulingExceptions(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ exceptionIds: ['e1'], resolutionType: 'CANCEL' });
    });

    expect(mockResolve).toHaveBeenCalledWith({ exceptionIds: ['e1'], resolutionType: 'CANCEL' });
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ['scheduling-exceptions', 't-1'], // covers the list and the count
        ['bookings', 't-1'],
        ['schedule', 'day-grid', 't-1'],
      ]),
    );
  });

  it('does not refresh anything when the first request fails: nothing changed', async () => {
    mockResolve.mockRejectedValue(new Error('network down'));
    const client = makeClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useResolveSchedulingExceptions(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ exceptionIds: ['e1'], resolutionType: 'CANCEL' }),
      ).rejects.toThrow('network down');
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
