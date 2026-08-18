// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { BOOKING_STATUS } from '@ikaro/types';
import { FormattingProvider } from '@/providers/formatting-provider';
import { useScheduleCoreData } from './schedule-page-core-data';
import type { SchedulePageControllerInput } from './schedule-page-controller-types';

const scheduleHooks = vi.hoisted(() => ({
  useScheduleClosures: vi.fn(),
  useScheduleOpenings: vi.fn(),
  useWeekBookings: vi.fn(),
}));

vi.mock('@/features/booking/schedule/useSchedule', () => scheduleHooks);

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
});
