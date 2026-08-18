// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS } from '@ikaro/types';
import type {
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { FormattingProvider } from '@/providers/formatting-provider';
import { useSchedulePageController } from './useSchedulePageController';
import type { SchedulePageControllerInput } from './schedule-page-controller-types';

const scheduleHooks = vi.hoisted(() => ({
  useScheduleClosures: vi.fn(),
  useScheduleOpenings: vi.fn(),
  useWeekBookings: vi.fn(),
  useCreateClosure: vi.fn(),
  useCreateOpening: vi.fn(),
  useRemoveClosure: vi.fn(),
  useRemoveOpening: vi.fn(),
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
    <NextIntlClientProvider locale="pt-BR" messages={ptBRMessages}>
      <FormattingProvider
        locale="pt-BR"
        currency="BRL"
        timezone="America/Sao_Paulo"
        dateFormat="DD/MM/YYYY"
        timeFormat="24h"
      >
        {children}
      </FormattingProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockMatchMedia(true);
  scheduleHooks.useScheduleClosures.mockReturnValue({ data: emptyClosures() });
  scheduleHooks.useScheduleOpenings.mockReturnValue({ data: emptyOpenings() });
  scheduleHooks.useWeekBookings.mockReturnValue({ data: emptyBookings() });
  scheduleHooks.useCreateClosure.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
  scheduleHooks.useCreateOpening.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({}) });
  scheduleHooks.useRemoveClosure.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  });
  scheduleHooks.useRemoveOpening.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue(undefined),
  });
});

describe('useSchedulePageController', () => {
  it('builds translated status labels for all 6 booking statuses', () => {
    const { result } = renderHook(() => useSchedulePageController(baseProps()), { wrapper });
    expect(Object.keys(result.current.statusLabels)).toHaveLength(6);
    expect(result.current.statusLabels[BOOKING_STATUS.APPROVED]).toBeTruthy();
  });

  it('composes weekNav, mutationHandlers, and statusFilter from the underlying hooks', () => {
    const { result } = renderHook(() => useSchedulePageController(baseProps()), { wrapper });
    expect(result.current.weekNav.handlePrevWeek).toBeInstanceOf(Function);
    expect(result.current.mutationHandlers.handleCreateClosure).toBeInstanceOf(Function);
    expect(result.current.statusFilter.handleToggleStatus).toBeInstanceOf(Function);
  });

  it('exposes the same scheduleReturnTo derived from ui.weekStartKey/selectedDateKey', () => {
    const { result } = renderHook(() => useSchedulePageController(baseProps()), { wrapper });
    expect(result.current.scheduleReturnTo).toBe(
      `/dashboard/schedule?weekStart=${result.current.ui.weekStartKey}&date=${result.current.ui.selectedDateKey}`,
    );
  });

  it('reflects the desktop-viewport default view mode (week) when no preference is persisted', () => {
    const { result } = renderHook(() => useSchedulePageController(baseProps()), { wrapper });
    expect(result.current.scheduleViewMode).toBe('week');
  });
});
