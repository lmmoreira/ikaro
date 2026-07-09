// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useDeactivateStaff,
  useInviteStaff,
  useStaff,
  useStaffMember,
  useUpdateStaff,
} from './useStaff';

vi.mock('@/features/staff/api/staff', () => ({
  listStaff: vi.fn().mockResolvedValue({
    items: [
      {
        id: 's-1',
        email: 'ana@acme.com',
        name: 'Ana',
        role: 'STAFF',
        isActive: true,
        createdAt: '',
      },
    ],
    pagination: { limit: 50, offset: 0, total: 1, hasMore: false, nextOffset: null },
  }),
  getStaffMember: vi.fn().mockResolvedValue({
    id: 's-1',
    email: 'ana@acme.com',
    name: 'Ana',
    role: 'STAFF',
    isActive: true,
    createdAt: '',
  }),
  inviteStaff: vi
    .fn()
    .mockResolvedValue({ staffId: 's-2', email: 'bob@acme.com', role: 'STAFF', isActive: false }),
  deactivateStaff: vi.fn().mockResolvedValue({ staffId: 's-1', isActive: false }),
  updateStaff: vi.fn().mockResolvedValue({ staffId: 's-1', name: 'Ana Editada', role: 'MANAGER' }),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useStaff', () => {
  it('fetches staff list', async () => {
    const { result } = renderHook(() => useStaff(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(1);
  });
});

describe('useStaffMember', () => {
  it('is disabled when id is empty', () => {
    const { result } = renderHook(() => useStaffMember(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('fetches when id is provided', async () => {
    const { result } = renderHook(() => useStaffMember('s-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('s-1');
  });
});

describe('useInviteStaff', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useInviteStaff(), { wrapper });
    act(() =>
      result.current.mutate({
        email: 'bob@acme.com',
        firstName: 'Bob',
        lastName: 'Smith',
        role: 'STAFF',
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useUpdateStaff', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useUpdateStaff(), { wrapper });
    act(() => result.current.mutate({ id: 's-1', body: { name: 'Ana Editada', role: 'MANAGER' } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useDeactivateStaff', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useDeactivateStaff(), { wrapper });
    act(() => result.current.mutate('s-1'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
