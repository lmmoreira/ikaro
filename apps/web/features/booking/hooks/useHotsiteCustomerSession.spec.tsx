// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerProfileResponse } from '@ikaro/types';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import { useHotsiteCustomerSession } from './useHotsiteCustomerSession';

vi.mock('@/features/platform/hotsite/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
}));

const profile: CustomerProfileResponse = {
  customerId: 'customer-1',
  email: 'joao@email.com',
  name: 'João Silva',
  phone: null,
  defaultAddress: null,
};

describe('useHotsiteCustomerSession', () => {
  beforeEach(() => {
    vi.mocked(getHotsiteCustomerProfile).mockReset();
  });

  it('starts loading, then reports the logged-in customer', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(profile);
    const { result } = renderHook(() => useHotsiteCustomerSession('acme'));

    expect(result.current).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current).toEqual({ status: 'customer', profile }));
    expect(getHotsiteCustomerProfile).toHaveBeenCalledWith('acme');
  });

  it('reports a guest when there is no session for this tenant', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
    const { result } = renderHook(() => useHotsiteCustomerSession('acme'));

    await waitFor(() => expect(result.current).toEqual({ status: 'guest' }));
  });

  it('treats a failed profile read as a guest instead of hanging', async () => {
    vi.mocked(getHotsiteCustomerProfile).mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useHotsiteCustomerSession('acme'));

    await waitFor(() => expect(result.current).toEqual({ status: 'guest' }));
  });
});
