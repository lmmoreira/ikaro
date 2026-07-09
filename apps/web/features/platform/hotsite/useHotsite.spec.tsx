// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useFeatureBookingPhoto,
  useGenerateHotsiteImageSignedUrl,
  useHotsiteConfig,
  usePublishHotsite,
  useUnpublishHotsite,
  useUpdateHotsiteConfig,
} from './useHotsite';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  getHotsiteConfig: vi.fn().mockResolvedValue({ id: 'h-1', branding: {}, layout: [], seo: {} }),
  updateHotsiteConfig: vi.fn().mockResolvedValue({ id: 'h-1', branding: {}, layout: [], seo: {} }),
  publishHotsite: vi.fn().mockResolvedValue({ publishedAt: '' }),
  unpublishHotsite: vi.fn().mockResolvedValue({ unpublishedAt: '' }),
  generateHotsiteImageSignedUrl: vi
    .fn()
    .mockResolvedValue({ signedUrl: 'https://example.com', filePath: 'path', expiresAt: '' }),
  featureBookingPhoto: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/providers/tenant-provider', () => ({
  useTenant: vi.fn().mockReturnValue({ tenantId: 't-1', tenantSlug: 'lavacar-bh' }),
}));

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => vi.clearAllMocks());

describe('useHotsiteConfig', () => {
  it('fetches hotsite config', async () => {
    const { result } = renderHook(() => useHotsiteConfig(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: 'h-1' });
  });
});

describe('useUpdateHotsiteConfig', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useUpdateHotsiteConfig(), { wrapper });
    act(() => result.current.mutate({ branding: { brandName: 'Acme' } }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('usePublishHotsite', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => usePublishHotsite(), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useUnpublishHotsite', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useUnpublishHotsite(), { wrapper });
    act(() => result.current.mutate());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useGenerateHotsiteImageSignedUrl', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useGenerateHotsiteImageSignedUrl(), { wrapper });
    act(() =>
      result.current.mutate({
        fileName: 'logo.jpg',
        contentType: 'image/jpeg',
        purpose: 'branding',
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useFeatureBookingPhoto', () => {
  it('mutates successfully', async () => {
    const { result } = renderHook(() => useFeatureBookingPhoto(), { wrapper });
    act(() =>
      result.current.mutate({ bookingId: 'b-1', photoType: 'after', filePath: 'path/photo.jpg' }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
