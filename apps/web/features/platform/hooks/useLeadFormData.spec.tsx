// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformErrorCode } from '@ikaro/types';
import type { CustomerProfileResponse, HotsiteLeadFormConfigResponse } from '@ikaro/types';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import { fetchLeadFormConfigClient } from '@/features/platform/hotsite/api/lead-form';
import { ApiError } from '@/shared/lib/api/errors';
import { useLeadFormData } from './useLeadFormData';

vi.mock('@/features/platform/hotsite/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
}));

vi.mock('@/features/platform/hotsite/api/lead-form', () => ({
  fetchLeadFormConfigClient: vi.fn(),
}));

const CONFIG: HotsiteLeadFormConfigResponse = {
  audienceMode: 'GUEST_AND_CUSTOMER',
  questions: [{ id: 'q1', label: 'Qual serviço?', type: 'TEXT', required: true, order: 1 }],
};

const OTHER_CONFIG: HotsiteLeadFormConfigResponse = {
  audienceMode: 'CUSTOMER_ONLY',
  questions: [],
};

const PROFILE: CustomerProfileResponse = {
  customerId: 'cust-1',
  name: 'Maria Fernanda Costa',
  email: 'maria.fernanda@email.com',
  phone: '+5511977771234',
  defaultAddress: null,
};

function pending<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('useLeadFormData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLeadFormConfigClient).mockResolvedValue(CONFIG);
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
  });

  it('is loading until both the configuration and the profile have arrived', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(PROFILE);

    const { result } = renderHook(() => useLeadFormData('lavacar'));

    expect(result.current.config).toBeUndefined();
    expect(result.current.customerProfile).toBeUndefined();
    await waitFor(() => expect(result.current.config).toBe(CONFIG));
    await waitFor(() => expect(result.current.customerProfile).toBe(PROFILE));
    expect(result.current.moduleUnavailable).toBe(false);
  });

  it('treats a visitor without a session as a guest (null profile)', async () => {
    const { result } = renderHook(() => useLeadFormData('lavacar'));

    await waitFor(() => expect(result.current.customerProfile).toBeNull());
  });

  it('gives a null profile when the profile cannot be loaded', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useLeadFormData('lavacar'));

    await waitFor(() => expect(result.current.customerProfile).toBeNull());
  });

  it('gives a null configuration when it cannot be loaded', async () => {
    vi.mocked(fetchLeadFormConfigClient).mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useLeadFormData('lavacar'));

    await waitFor(() => expect(result.current.config).toBeNull());
    expect(result.current.moduleUnavailable).toBe(false);
  });

  it('reports the module as unavailable, not as a failed load, when it was disabled meanwhile', async () => {
    vi.mocked(fetchLeadFormConfigClient).mockRejectedValue(
      new ApiError(404, 'not enabled', { code: PlatformErrorCode.LEAD_FORM_NOT_ENABLED }),
    );

    const { result } = renderHook(() => useLeadFormData('lavacar'));

    await waitFor(() => expect(result.current.moduleUnavailable).toBe(true));
    expect(result.current.config).toBeUndefined();
  });

  it('goes back to loading and fetches again when the load is retried', async () => {
    vi.mocked(fetchLeadFormConfigClient).mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useLeadFormData('lavacar'));
    await waitFor(() => expect(result.current.config).toBeNull());

    act(() => result.current.retryConfig());

    expect(result.current.config).toBeUndefined();
    await waitFor(() => expect(result.current.config).toBe(CONFIG));
    expect(fetchLeadFormConfigClient).toHaveBeenCalledTimes(2);
  });

  it('fetches both again for a new slug', async () => {
    const { rerender } = renderHook(({ slug }) => useLeadFormData(slug), {
      initialProps: { slug: 'lavacar' },
    });

    rerender({ slug: 'autospa' });

    await waitFor(() => expect(fetchLeadFormConfigClient).toHaveBeenCalledWith('autospa'));
    expect(getHotsiteCustomerProfile).toHaveBeenCalledWith('autospa');
  });

  it('ignores a slow response for a slug the page has since left', async () => {
    const slow = pending<HotsiteLeadFormConfigResponse>();
    vi.mocked(fetchLeadFormConfigClient).mockImplementation((slug) =>
      slug === 'lavacar' ? slow.promise : Promise.resolve(OTHER_CONFIG),
    );
    const { result, rerender } = renderHook(({ slug }) => useLeadFormData(slug), {
      initialProps: { slug: 'lavacar' },
    });

    rerender({ slug: 'autospa' });
    await waitFor(() => expect(result.current.config).toBe(OTHER_CONFIG));
    await act(async () => slow.resolve(CONFIG));

    expect(result.current.config).toBe(OTHER_CONFIG);
  });
});
