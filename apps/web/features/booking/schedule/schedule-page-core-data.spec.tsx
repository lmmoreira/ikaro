// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ResourceResponse,
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import { FormattingProvider } from '@/providers/formatting-provider';
import { TenantProvider } from '@/providers/tenant-provider';
import { useScheduleCoreData } from './schedule-page-core-data';
import type { SchedulePageControllerInput } from './schedule-page-controller-types';
import { RESOURCE_FILTER_MAX_SELECTED } from './schedule-page-interaction-handlers';

const scheduleHooks = vi.hoisted(() => ({
  useScheduleClosures: vi.fn(),
  useScheduleOpenings: vi.fn(),
  useWeekBookings: vi.fn(),
  useScheduleWeekDayGrid: vi.fn(),
}));

vi.mock('@/features/booking/schedule/useSchedule', () => scheduleHooks);

const selectableResourcesHooks = vi.hoisted(() => ({
  useSelectableResources: vi.fn(),
}));

vi.mock('@/features/booking/schedule/useSelectableResources', () => selectableResourcesHooks);

function makeResource(overrides: Partial<ResourceResponse> = {}): ResourceResponse {
  return {
    id: 'res-active',
    type: 'ROOM',
    refId: null,
    name: 'Sala',
    workingHours: null,
    turnoverMinutes: 0,
    maxCapacity: null,
    isActive: true,
    ...overrides,
  };
}

function emptyClosures(): ScheduleClosureListResponse {
  return { items: [] };
}
function emptyOpenings(): ScheduleOpeningListResponse {
  return { items: [] };
}
function emptyBookings(): StaffBookingListResponse {
  return { items: [], total: 0, page: 1, limit: 50 };
}

function makeBusinessHours(): TenantBusinessHours {
  return {
    timezone: 'America/Sao_Paulo',
    monday: { open: '09:00', close: '18:00' },
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  };
}

function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function baseProps(): SchedulePageControllerInput {
  return {
    initialClosures: emptyClosures(),
    initialOpenings: emptyOpenings(),
    initialBookings: emptyBookings(),
    businessHours: makeBusinessHours(),
    todayKey: '2026-08-17',
    weekStartKey: '2026-08-17',
    slotGranularityMinutes: 30,
  };
}

function wrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return (
    <FormattingProvider
      locale="pt-BR"
      currency="BRL"
      timezone="America/Sao_Paulo"
      dateFormat="DD/MM/YYYY"
      timeFormat="24h"
    >
      {children}
    </FormattingProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockMatchMedia(false);
  scheduleHooks.useScheduleClosures.mockReturnValue({ data: emptyClosures() });
  scheduleHooks.useScheduleOpenings.mockReturnValue({ data: emptyOpenings() });
  scheduleHooks.useWeekBookings.mockReturnValue({ data: emptyBookings() });
  scheduleHooks.useScheduleWeekDayGrid.mockReturnValue({
    data: [],
    isError: false,
    error: undefined,
  });
  selectableResourcesHooks.useSelectableResources.mockReturnValue({
    resources: [],
    isLoading: false,
    isError: false,
    error: null,
  });
});

describe('useScheduleCoreData', () => {
  it('defaults the view mode to day on a narrow (non-desktop) viewport', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useScheduleCoreData(baseProps()), { wrapper });
    expect(result.current.scheduleViewMode).toBe('day');
  });

  it('defaults the view mode to week on a desktop viewport', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useScheduleCoreData(baseProps()), { wrapper });
    expect(result.current.scheduleViewMode).toBe('week');
  });

  it('filters visibleBookings down to the (default) selected status set', () => {
    scheduleHooks.useWeekBookings.mockReturnValue({
      data: {
        items: [
          {
            bookingId: 'pending-1',
            status: BOOKING_STATUS.PENDING, // not in the default filter set
            scheduledAt: '2026-08-17T12:00:00.000Z',
            contactName: 'A',
            serviceNames: [],
            totalPrice: { amount: 0, currency: 'BRL' },
            totalDurationMins: 30,
            isCustomer: false,
          },
          {
            bookingId: 'approved-1',
            status: BOOKING_STATUS.APPROVED,
            scheduledAt: '2026-08-17T12:00:00.000Z',
            contactName: 'B',
            serviceNames: [],
            totalPrice: { amount: 0, currency: 'BRL' },
            totalDurationMins: 30,
            isCustomer: false,
          },
        ],
        total: 2,
        page: 1,
        limit: 50,
      },
    });

    const { result } = renderHook(() => useScheduleCoreData(baseProps()), { wrapper });
    expect(result.current.visibleBookings.map((b) => b.bookingId)).toEqual(['approved-1']);
  });

  it('composes the derived timeline for the initial selected date', () => {
    const { result } = renderHook(() => useScheduleCoreData(baseProps()), { wrapper });
    expect(result.current.ui.selectedDateKey).toBe('2026-08-17');
    expect(result.current.selectedDayTimeline.selectedDayClosed).toBe(false);
    expect(result.current.timezone).toBe('America/Sao_Paulo');
  });

  it('surfaces a fetch error instead of silently reporting an empty schedule', () => {
    scheduleHooks.useScheduleClosures.mockReturnValue({
      isError: true,
      error: new Error('boom'),
    });
    const { result } = renderHook(() => useScheduleCoreData(baseProps()), { wrapper });
    expect(result.current.scheduleFetchError).toBeInstanceOf(Error);
  });

  it("drops a persisted resource id that's no longer in the active resource list (MANAGER only)", async () => {
    window.localStorage.setItem(
      'ikaro:schedule',
      JSON.stringify({
        'selectedResourceIds:tenant-x': { selectedResourceIds: ['res-active', 'res-stale'] },
      }),
    );
    selectableResourcesHooks.useSelectableResources.mockReturnValue({
      resources: [makeResource({ id: 'res-active' })],
      isLoading: false,
      isError: false,
      error: null,
    });

    // Passed via a variable, not a literal — see tenant-provider.spec.tsx's own note on why
    // jsx-a11y/aria-role would otherwise misfire on this unrelated, non-DOM `role` prop.
    const managerRole = 'MANAGER' as const;
    function managerWrapper({ children }: { readonly children: React.ReactNode }) {
      return (
        <TenantProvider tenantId="tenant-x" tenantSlug="tenant-x" role={managerRole}>
          {wrapper({ children })}
        </TenantProvider>
      );
    }

    const { result } = renderHook(() => useScheduleCoreData(baseProps()), {
      wrapper: managerWrapper,
    });

    expect(result.current.selectedResourceIdSet).toEqual(new Set(['res-active']));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('ikaro:schedule') ?? '{}') as Record<
        string,
        unknown
      >;
      expect(stored['selectedResourceIds:tenant-x']).toEqual({
        selectedResourceIds: ['res-active'],
      });
    });
  });

  it('truncates a persisted selection larger than the cap to the first 6, by persisted order (TD44)', async () => {
    const persistedIds = Array.from({ length: 7 }, (_, i) => `res-${i}`);
    window.localStorage.setItem(
      'ikaro:schedule',
      JSON.stringify({ 'selectedResourceIds:tenant-x': { selectedResourceIds: persistedIds } }),
    );
    selectableResourcesHooks.useSelectableResources.mockReturnValue({
      resources: persistedIds.map((id) => makeResource({ id })),
      isLoading: false,
      isError: false,
      error: null,
    });

    const managerRole = 'MANAGER' as const;
    function managerWrapper({ children }: { readonly children: React.ReactNode }) {
      return (
        <TenantProvider tenantId="tenant-x" tenantSlug="tenant-x" role={managerRole}>
          {wrapper({ children })}
        </TenantProvider>
      );
    }

    const { result } = renderHook(() => useScheduleCoreData(baseProps()), {
      wrapper: managerWrapper,
    });

    const expectedIds = persistedIds.slice(0, RESOURCE_FILTER_MAX_SELECTED);
    expect(result.current.selectedResourceIdSet).toEqual(new Set(expectedIds));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('ikaro:schedule') ?? '{}') as Record<
        string,
        unknown
      >;
      expect(stored['selectedResourceIds:tenant-x']).toEqual({ selectedResourceIds: expectedIds });
    });
  });

  it('preserves the persisted resource selection when the resource-list fetch errors, instead of reconciling it away', async () => {
    window.localStorage.setItem(
      'ikaro:schedule',
      JSON.stringify({
        'selectedResourceIds:tenant-x': { selectedResourceIds: ['res-1', 'res-2'] },
      }),
    );
    selectableResourcesHooks.useSelectableResources.mockReturnValue({
      resources: [],
      isLoading: false,
      isError: true,
      error: new Error('network down'),
    });

    const managerRole = 'MANAGER' as const;
    function managerWrapper({ children }: { readonly children: React.ReactNode }) {
      return (
        <TenantProvider tenantId="tenant-x" tenantSlug="tenant-x" role={managerRole}>
          {wrapper({ children })}
        </TenantProvider>
      );
    }

    const { result } = renderHook(() => useScheduleCoreData(baseProps()), {
      wrapper: managerWrapper,
    });

    expect(result.current.selectedResourceIdSet).toEqual(new Set(['res-1', 'res-2']));

    const stored = JSON.parse(window.localStorage.getItem('ikaro:schedule') ?? '{}') as Record<
      string,
      unknown
    >;
    expect(stored['selectedResourceIds:tenant-x']).toEqual({
      selectedResourceIds: ['res-1', 'res-2'],
    });
  });

  it('caps the effective (rendered) selection at 6 even when the resource-list fetch errors, while leaving the persisted value untouched (TD44 round 2)', () => {
    const persistedIds = Array.from({ length: 7 }, (_, i) => `res-${i}`);
    window.localStorage.setItem(
      'ikaro:schedule',
      JSON.stringify({ 'selectedResourceIds:tenant-x': { selectedResourceIds: persistedIds } }),
    );
    selectableResourcesHooks.useSelectableResources.mockReturnValue({
      resources: [],
      isLoading: false,
      isError: true,
      error: new Error('network down'),
    });

    const managerRole = 'MANAGER' as const;
    function managerWrapper({ children }: { readonly children: React.ReactNode }) {
      return (
        <TenantProvider tenantId="tenant-x" tenantSlug="tenant-x" role={managerRole}>
          {wrapper({ children })}
        </TenantProvider>
      );
    }

    const { result } = renderHook(() => useScheduleCoreData(baseProps()), {
      wrapper: managerWrapper,
    });

    // Effective/rendered value is capped regardless of the fetch error...
    expect(result.current.selectedResourceIdSet).toEqual(
      new Set(persistedIds.slice(0, RESOURCE_FILTER_MAX_SELECTED)),
    );

    // ...but the persisted value itself is left exactly as-is — not destructively truncated over
    // what may be a transient failure, same rationale as the sibling error-preservation test above.
    const stored = JSON.parse(window.localStorage.getItem('ikaro:schedule') ?? '{}') as Record<
      string,
      unknown
    >;
    expect(stored['selectedResourceIds:tenant-x']).toEqual({ selectedResourceIds: persistedIds });
  });

  it('never applies a persisted resource selection for STAFF, even one left over from a prior MANAGER session on the same device', () => {
    window.localStorage.setItem(
      'ikaro:schedule',
      JSON.stringify({
        'selectedResourceIds:tenant-x': { selectedResourceIds: ['res-1', 'res-2'] },
      }),
    );

    const staffRole = 'STAFF' as const;
    function staffWrapper({ children }: { readonly children: React.ReactNode }) {
      return (
        <TenantProvider tenantId="tenant-x" tenantSlug="tenant-x" role={staffRole}>
          {wrapper({ children })}
        </TenantProvider>
      );
    }

    const { result } = renderHook(() => useScheduleCoreData(baseProps()), {
      wrapper: staffWrapper,
    });

    // The effective selection used for querying/filtering must be empty for STAFF regardless of
    // what's persisted — STAFF has no UI to view or clear this preference.
    expect(result.current.selectedResourceIdSet).toEqual(new Set());
    expect(scheduleHooks.useScheduleClosures).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      [],
    );
  });

  describe('Week view resource filter/badges (TD44 Story 1)', () => {
    function managerWrapperWith(tenantId: string) {
      const managerRole = 'MANAGER' as const;
      return function managerWrapper({ children }: { readonly children: React.ReactNode }) {
        return (
          <TenantProvider tenantId={tenantId} tenantSlug={tenantId} role={managerRole}>
            {wrapper({ children })}
          </TenantProvider>
        );
      };
    }

    it('threads the checked resource set and its day-grid lookup through to weekTimelineCards', () => {
      window.localStorage.setItem(
        'ikaro:schedule',
        JSON.stringify({ 'selectedResourceIds:tenant-badges': { selectedResourceIds: ['res-1'] } }),
      );
      selectableResourcesHooks.useSelectableResources.mockReturnValue({
        resources: [makeResource({ id: 'res-1', name: 'Camila Duarte' })],
        isLoading: false,
        isError: false,
        error: null,
      });
      scheduleHooks.useWeekBookings.mockReturnValue({
        data: {
          items: [
            {
              bookingId: 'booking-1',
              status: BOOKING_STATUS.APPROVED,
              scheduledAt: '2026-08-17T12:00:00.000Z',
              contactName: 'João Silva',
              serviceNames: [],
              totalPrice: { amount: 0, currency: 'BRL' },
              totalDurationMins: 30,
              isCustomer: false,
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        },
      });
      scheduleHooks.useScheduleWeekDayGrid.mockReturnValue({
        data: [
          {
            date: '2026-08-17',
            columns: [
              {
                resourceId: 'res-1',
                name: 'Camila Duarte',
                type: 'STAFF',
                blocks: [{ startsAt: '', endsAt: '', kind: 'BOOKING', refId: 'booking-1' }],
              },
            ],
          },
        ],
        isError: false,
        error: undefined,
      });

      const { result } = renderHook(() => useScheduleCoreData(baseProps()), {
        wrapper: managerWrapperWith('tenant-badges'),
      });

      const weekEvents = result.current.weekTimelineCards[0].events;
      expect(weekEvents).toHaveLength(1);
      expect(weekEvents[0].kind === 'booking' && weekEvents[0].resourceNames).toEqual([
        'Camila Duarte',
      ]);

      // Day view's own merged timeline is unaffected by this same booking/filter (it renders
      // through the separate ScheduleResourceColumnsBoard when 1+ resources are checked instead).
      expect(result.current.selectedDayTimeline.events).toHaveLength(1);
    });
  });
});
