// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTenantSettings } from './useTenantSettings';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  getTenantSettings: vi.fn().mockResolvedValue({
    tenantId: 't-1',
    settings: {
      businessHours: {
        timezone: 'America/Sao_Paulo',
        monday: { open: '09:00', close: '18:00' },
        tuesday: { open: '09:00', close: '18:00' },
        wednesday: { open: '09:00', close: '18:00' },
        thursday: { open: '09:00', close: '18:00' },
        friday: { open: '09:00', close: '18:00' },
        saturday: null,
        sunday: null,
      },
    },
  }),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useTenantSettings', () => {
  it('fetches the tenant settings', async () => {
    const { result } = renderHook(() => useTenantSettings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.settings.businessHours.monday).toEqual({
      open: '09:00',
      close: '18:00',
    });
  });
});
