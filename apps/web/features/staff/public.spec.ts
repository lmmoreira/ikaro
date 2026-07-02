import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffResponse } from '@ikaro/types';
import { getHotsiteStaffProfile } from './public';

describe('getHotsiteStaffProfile', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the profile on a successful response', async () => {
    const profile: StaffResponse = {
      id: 'staff-1',
      email: 'gerente@lavacar.com.br',
      name: 'Gerente Silva',
      role: 'MANAGER',
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    };
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }));

    const result = await getHotsiteStaffProfile('lavacar-beloauto');

    expect(result).toEqual(profile);
    expect(fetchSpy).toHaveBeenCalledWith('/api/staff/me?slug=lavacar-beloauto');
  });

  it('returns null when unauthenticated', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }),
    );

    const result = await getHotsiteStaffProfile('lavacar-beloauto');

    expect(result).toBeNull();
  });

  it('returns null when the JWT tenant does not match the requested hotsite (403)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }),
    );

    const result = await getHotsiteStaffProfile('ikaro');

    expect(result).toBeNull();
  });

  it('returns null when the JWT role is CUSTOMER, not STAFF/MANAGER (403)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }),
    );

    const result = await getHotsiteStaffProfile('lavacar-beloauto');

    expect(result).toBeNull();
  });

  it('returns null when fetch rejects (network error)', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));

    const result = await getHotsiteStaffProfile('lavacar-beloauto');

    expect(result).toBeNull();
  });
});
