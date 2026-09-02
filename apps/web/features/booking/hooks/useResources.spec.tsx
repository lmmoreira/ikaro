// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useCreateResource,
  useDeactivateResource,
  useReactivateResource,
  useResource,
  useResources,
  useUpdateResource,
} from './useResources';

// vi.mock factories are hoisted above top-level const declarations, so a shared const can't be
// referenced here directly — build the same shape inline instead (mirrors useStaff.spec.tsx's
// mock-literal-per-call convention).
vi.mock('@/features/booking/api/resources', () => ({
  listResources: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'r-1',
        type: 'STAFF',
        refId: 's-1',
        name: 'Camila Duarte',
        workingHours: null,
        turnoverMinutes: 15,
        maxCapacity: null,
        isActive: true,
      },
    ],
  }),
  getResource: vi.fn().mockResolvedValue({
    id: 'r-1',
    type: 'STAFF',
    refId: 's-1',
    name: 'Camila Duarte',
    workingHours: null,
    turnoverMinutes: 15,
    maxCapacity: null,
    isActive: true,
  }),
  createResource: vi.fn().mockResolvedValue({
    id: 'r-1',
    type: 'STAFF',
    refId: 's-1',
    name: 'Camila Duarte',
    workingHours: null,
    turnoverMinutes: 15,
    maxCapacity: null,
    isActive: true,
  }),
  updateResource: vi.fn().mockResolvedValue({
    id: 'r-1',
    type: 'STAFF',
    refId: 's-1',
    name: 'Camila D. Editada',
    workingHours: null,
    turnoverMinutes: 15,
    maxCapacity: null,
    isActive: true,
  }),
  deactivateResource: vi.fn().mockResolvedValue(undefined),
  reactivateResource: vi.fn().mockResolvedValue({
    id: 'r-1',
    type: 'STAFF',
    refId: 's-1',
    name: 'Camila Duarte',
    workingHours: null,
    turnoverMinutes: 15,
    maxCapacity: null,
    isActive: true,
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

describe('useResources', () => {
  it('fetches the resource list', async () => {
    const { result } = renderHook(() => useResources(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
  });
});

describe('useResource', () => {
  it('is disabled when id is empty', () => {
    const { result } = renderHook(() => useResource(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches when id is provided', async () => {
    const { result } = renderHook(() => useResource('r-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('r-1');
  });
});

describe('useCreateResource', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useCreateResource(), { wrapper });
    act(() =>
      result.current.mutate({
        type: 'ROOM',
        name: 'Sala 1',
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useUpdateResource', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useUpdateResource(), { wrapper });
    act(() => result.current.mutate({ id: 'r-1', body: { name: 'Camila D. Editada' } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useDeactivateResource', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useDeactivateResource(), { wrapper });
    act(() => result.current.mutate('r-1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useReactivateResource', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useReactivateResource(), { wrapper });
    act(() => result.current.mutate('r-1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
