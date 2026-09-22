// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { useSelectableResources } from './useSelectableResources';

const RESOURCES: ResourceResponse[] = [
  {
    id: 'loc-1',
    type: 'LOCATION',
    refId: null,
    name: 'Localização Principal',
    workingHours: null,
    turnoverMinutes: 0,
    maxCapacity: null,
    isActive: true,
  },
  {
    id: 'staff-1',
    type: 'STAFF',
    refId: 's-1',
    name: 'Camila Duarte',
    workingHours: null,
    turnoverMinutes: 15,
    maxCapacity: null,
    isActive: true,
  },
];

const useResourcesMock = vi.fn();

vi.mock('@/features/booking/hooks/useResources', () => ({
  useResources: () => useResourcesMock(),
}));

describe('useSelectableResources', () => {
  it('excludes the LOCATION resource', () => {
    useResourcesMock.mockReturnValue({
      data: { items: RESOURCES },
      isLoading: false,
      isError: false,
      error: null,
    });

    const { result } = renderHook(() => useSelectableResources());
    expect(result.current.resources).toEqual([RESOURCES[1]]);
  });

  it('returns an empty array while loading', () => {
    useResourcesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });

    const { result } = renderHook(() => useSelectableResources());
    expect(result.current.resources).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('surfaces isError/error from the underlying fetch', () => {
    const error = new Error('network down');
    useResourcesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error,
    });

    const { result } = renderHook(() => useSelectableResources());
    expect(result.current.isError).toBe(true);
    expect(result.current.error).toBe(error);
  });
});
