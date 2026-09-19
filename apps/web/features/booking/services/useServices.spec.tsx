// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useActivateService,
  useCreateService,
  useDeactivateService,
  usePublishServiceIntakeSchema,
  useServices,
  useUpdateService,
  useUpdateServiceBookingPolicy,
  useUpdateServiceLegs,
  useUpdateServiceResourceRequirements,
} from './useServices';

vi.mock('@/features/booking/api/services', () => ({
  listServices: vi.fn().mockResolvedValue({ items: [] }),
  createService: vi.fn().mockResolvedValue({ id: 'svc-1', name: 'Lavagem' }),
  updateService: vi.fn().mockResolvedValue({ id: 'svc-1', name: 'Lavagem Premium' }),
  activateService: vi.fn().mockResolvedValue({ id: 'svc-1', isActive: true }),
  deactivateService: vi.fn().mockResolvedValue({ id: 'svc-1', isActive: false }),
  updateServiceResourceRequirements: vi
    .fn()
    .mockResolvedValue({ id: 'svc-1', resourceRequirements: [] }),
  updateServiceLegs: vi.fn().mockResolvedValue({ id: 'svc-1', legs: [], totalSpanMinutes: 0 }),
  updateServiceBookingPolicy: vi.fn().mockResolvedValue({ id: 'svc-1', bookingPolicy: {} }),
  publishServiceIntakeSchema: vi.fn().mockResolvedValue({ id: 'schema-1', version: 1 }),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
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

describe('useActivateService', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useActivateService(), { wrapper });
    act(() => result.current.mutate('svc-1'));
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

describe('useUpdateServiceResourceRequirements', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useUpdateServiceResourceRequirements(), { wrapper });
    act(() =>
      result.current.mutate({
        id: 'svc-1',
        body: { resourceRequirements: [{ type: 'STAFF', selectionMode: 'CUSTOMER_CHOICE' }] },
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useUpdateServiceLegs', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useUpdateServiceLegs(), { wrapper });
    act(() => result.current.mutate({ id: 'svc-1', body: { legs: [] } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useUpdateServiceBookingPolicy', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useUpdateServiceBookingPolicy(), { wrapper });
    act(() => result.current.mutate({ id: 'svc-1', body: { recurrenceEligible: true } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('usePublishServiceIntakeSchema', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => usePublishServiceIntakeSchema(), { wrapper });
    act(() =>
      result.current.mutate({
        id: 'svc-1',
        body: {
          questions: [{ fieldKey: 'q', label: 'Q', type: 'FREE_TEXT', required: false }],
          consentText: 'Concordo',
        },
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
