// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteServiceResourceOptionsRequirement } from '@ikaro/types';
import {
  fetchPublicIntakeSchema,
  fetchServiceResourceOptions,
} from '@/features/booking/api/public';
import { choiceRequirement, makeHotsiteService } from '@/test-utils';
import { useBookingFormData } from './useBookingFormData';

vi.mock('@/features/booking/api/public', () => ({
  fetchPublicIntakeSchema: vi.fn(),
  fetchServiceResourceOptions: vi.fn(),
}));

const plain = makeHotsiteService({ id: 'plain' });
const staff = makeHotsiteService({
  id: 'staff',
  resourceRequirements: [choiceRequirement('STAFF')],
});

const schema = {
  id: 's',
  version: 3,
  questions: [],
  consentText: 'ok',
  consentVersion: 1,
  requiresNamedAttendees: false,
  participantCountRequired: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function requirement(options: number): HotsiteServiceResourceOptionsRequirement {
  return {
    serviceId: 'staff',
    legIndex: null,
    resourceType: 'STAFF',
    selectionMode: 'CUSTOMER_CHOICE',
    requiredQuantity: 1,
    options: Array.from({ length: options }, (_, i) => ({ resourceId: `r${i}`, name: `R${i}` })),
  };
}

afterEach(() => {
  vi.mocked(fetchPublicIntakeSchema).mockReset();
  vi.mocked(fetchServiceResourceOptions).mockReset();
});

describe('useBookingFormData', () => {
  it('is idle before the first load', () => {
    const { result } = renderHook(() =>
      useBookingFormData({ slug: 's', selectedServices: [plain] }),
    );

    expect(result.current.data.status).toBe('idle');
  });

  it('fetches one schema per selected service and options only for choice services', async () => {
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null });
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({ requirements: [requirement(2)] });
    const services = [plain, staff];
    const { result } = renderHook(() =>
      useBookingFormData({ slug: 's', selectedServices: services }),
    );

    await act(async () => {
      await result.current.load();
    });

    expect(fetchPublicIntakeSchema).toHaveBeenCalledTimes(2);
    expect(fetchServiceResourceOptions).toHaveBeenCalledTimes(1);
    expect(fetchServiceResourceOptions).toHaveBeenCalledWith('s', 'staff');
    expect(result.current.data.status).toBe('ready');
    expect(result.current.data.requirements).toHaveLength(1);
    expect(result.current.data.unavailableServiceIds).toEqual([]);
  });

  it('keeps the first active schema with its displayed version', async () => {
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValueOnce({ active: null });
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValueOnce({ active: schema });
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({ requirements: [] });
    const { result } = renderHook(() =>
      useBookingFormData({ slug: 's', selectedServices: [plain, staff] }),
    );

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.data.intakeSchema?.version).toBe(3);
  });

  it('flags a service whose requirement has no option as unavailable', async () => {
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null });
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({ requirements: [requirement(0)] });
    const { result } = renderHook(() =>
      useBookingFormData({ slug: 's', selectedServices: [staff] }),
    );

    await act(async () => {
      await result.current.load();
    });

    expect(result.current.data.unavailableServiceIds).toEqual(['staff']);
  });

  it('fails closed on a fetch error and can retry', async () => {
    vi.mocked(fetchPublicIntakeSchema).mockRejectedValueOnce(new Error('boom'));
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null });
    const { result } = renderHook(() =>
      useBookingFormData({ slug: 's', selectedServices: [plain] }),
    );

    let outcome = await act(async () => result.current.load());
    expect(outcome).toEqual({ kind: 'error' });
    expect(result.current.data.status).toBe('error');

    outcome = await act(async () => result.current.load());
    expect(outcome.kind).toBe('ready');
    expect(result.current.data.status).toBe('ready');
  });

  it('does not fetch again once ready for the same selection', async () => {
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null });
    const { result } = renderHook(() =>
      useBookingFormData({ slug: 's', selectedServices: [plain] }),
    );

    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.load();
    });

    expect(fetchPublicIntakeSchema).toHaveBeenCalledTimes(1);
  });

  it('forgets the result when the selection changes', async () => {
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null });
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({ requirements: [] });
    const { result, rerender } = renderHook(
      ({ services }) => useBookingFormData({ slug: 's', selectedServices: services }),
      { initialProps: { services: [plain] } },
    );
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.data.status).toBe('ready');

    rerender({ services: [staff] });

    expect(result.current.data.status).toBe('idle');
  });

  it('re-fetches only the options and keeps the schema', async () => {
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: schema });
    vi.mocked(fetchServiceResourceOptions).mockResolvedValueOnce({
      requirements: [requirement(2)],
    });
    vi.mocked(fetchServiceResourceOptions).mockResolvedValueOnce({
      requirements: [requirement(0)],
    });
    const { result } = renderHook(() =>
      useBookingFormData({ slug: 's', selectedServices: [staff] }),
    );
    await act(async () => {
      await result.current.load();
    });

    const fresh = await act(async () => result.current.refetchOptions());

    expect(fresh?.[0]?.options).toHaveLength(0);
    expect(result.current.data.intakeSchema?.version).toBe(3);
    expect(result.current.data.unavailableServiceIds).toEqual(['staff']);
  });

  it('returns null when the options re-fetch fails', async () => {
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null });
    vi.mocked(fetchServiceResourceOptions).mockResolvedValueOnce({
      requirements: [requirement(1)],
    });
    vi.mocked(fetchServiceResourceOptions).mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() =>
      useBookingFormData({ slug: 's', selectedServices: [staff] }),
    );
    await act(async () => {
      await result.current.load();
    });

    const fresh = await act(async () => result.current.refetchOptions());

    expect(fresh).toBeNull();
    expect(result.current.data.status).toBe('ready');
  });
});
