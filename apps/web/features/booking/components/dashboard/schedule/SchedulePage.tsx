'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type {
  BookingStatus,
  CreateClosureRequest,
  CreateOpeningRequest,
  ScheduleClosure,
  ScheduleClosureListResponse,
  ScheduleOpening,
  ScheduleOpeningListResponse,
  StaffBookingCardResponse,
  StaffBookingListResponse,
  TenantDayHours,
  TenantBusinessHours,
} from '@ikaro/types';
import { AlertTriangle, CalendarDays, ChevronDown, Filter, Lock, Plus, Unlock } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card } from '@/shared/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { cn } from '@/shared/utils/cn';
import { toDateKeyInTimezone } from '@/shared/utils/date-utils';
import { WeekNav } from '@/shells/dashboard/components/WeekNav';
import {
  BOOKING_STATUS_CLASSES,
  buildBookingStatusLabels,
  SCHEDULE_BOOKING_STATUS_DEFAULT,
  SCHEDULE_BOOKING_STATUS_OPTIONS,
} from '@/features/booking/model/booking-status';
import {
  useCreateClosure,
  useCreateOpening,
  useRemoveClosure,
  useRemoveOpening,
  useScheduleClosures,
  useScheduleOpenings,
  useWeekBookings,
} from '@/features/booking/schedule/useSchedule';
import {
  getDayHoursForDate,
  getLocalTimeKey,
  getWeekDates,
  getWeekEndKey,
  getWeekStartKey,
  minutesToTime,
  overlaps,
  parseDateKey,
  timeToMinutes,
} from '@/features/booking/schedule/date-utils';
import { ClosureFormSheet } from './ClosureFormSheet';
import { OpeningFormSheet } from './OpeningFormSheet';
import { RemoveClosureDialog } from './RemoveClosureDialog';
import { RemoveOpeningDialog } from './RemoveOpeningDialog';

interface SchedulePageProps {
  readonly initialClosures: ScheduleClosureListResponse;
  readonly initialOpenings: ScheduleOpeningListResponse;
  readonly initialBookings: StaffBookingListResponse;
  readonly businessHours: TenantBusinessHours;
  readonly todayKey: string;
  readonly weekStartKey: string;
  readonly initialSelectedDateKey?: string;
  readonly slotGranularityMinutes: 15 | 30 | 60;
}

interface TimelineEventBase {
  readonly id: string;
  readonly startMinutes: number;
  readonly endMinutes: number;
  readonly title: string;
  readonly subtitle: string;
}

interface BookingTimelineEvent extends TimelineEventBase {
  readonly kind: 'booking';
  readonly booking: StaffBookingCardResponse;
  readonly warning: boolean;
  readonly laneIndex: number;
  readonly laneCount: number;
}

interface ClosureTimelineEvent extends TimelineEventBase {
  readonly kind: 'closure';
  readonly closure: ScheduleClosure;
}

interface OpeningTimelineEvent extends TimelineEventBase {
  readonly kind: 'opening';
  readonly opening: ScheduleOpening;
}

type TimelineEvent = BookingTimelineEvent | ClosureTimelineEvent | OpeningTimelineEvent;

interface TimelineDayData {
  readonly selectedOpening: ScheduleOpening | null;
  readonly selectedDayHours: TenantDayHours | null;
  readonly selectedDayClosed: boolean;
  readonly timelineStartMinutes: number;
  readonly timelineEndMinutes: number;
  readonly slotCount: number;
  readonly slotHeight: number;
  readonly events: TimelineEvent[];
}

function getSlotHeight(slotGranularityMinutes: number, scale = 1): number {
  return Math.max(18, Math.round((slotGranularityMinutes / 30) * 48 * scale));
}

function getEventMinutes(startMinutes: number, endMinutes: number, slotMinutes: number): number {
  return Math.max(slotMinutes, endMinutes - startMinutes);
}

function buildWeekShift(weekStartKey: string, deltaDays: number): string {
  const next = new Date(parseDateKey(weekStartKey));
  next.setUTCDate(next.getUTCDate() + deltaDays);
  return next.toISOString().slice(0, 10);
}

function toLocalDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQuery.matches);

    updateMatches();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateMatches);
      return () => mediaQuery.removeEventListener('change', updateMatches);
    }

    mediaQuery.addListener(updateMatches);
    return () => mediaQuery.removeListener(updateMatches);
  }, [query]);

  return matches;
}

function formatEventRange(startTime: string, endTime: string): string {
  return `${startTime}–${endTime}`;
}

function getBookingTimeKey(
  booking: StaffBookingCardResponse,
  timezone: string,
): {
  readonly startTime: string;
  readonly endTime: string;
} {
  const start = new Date(booking.scheduledAt);
  const end = new Date(start.getTime() + booking.totalDurationMins * 60_000);
  return {
    startTime: getLocalTimeKey(start, timezone),
    endTime: getLocalTimeKey(end, timezone),
  };
}

function getBookingDateKey(booking: StaffBookingCardResponse, timezone: string): string {
  return toDateKeyInTimezone(new Date(booking.scheduledAt), timezone);
}

function assignBookingLanes(bookings: readonly BookingTimelineEvent[]): BookingTimelineEvent[] {
  if (bookings.length === 0) return [];

  const sorted = [...bookings].sort(
    (left, right) => left.startMinutes - right.startMinutes || left.endMinutes - right.endMinutes,
  );

  const grouped: BookingTimelineEvent[][] = [];
  let currentGroup: BookingTimelineEvent[] = [];
  let currentGroupEnd = -Infinity;

  for (const booking of sorted) {
    if (currentGroup.length === 0 || booking.startMinutes >= currentGroupEnd) {
      if (currentGroup.length > 0) grouped.push(currentGroup);
      currentGroup = [booking];
      currentGroupEnd = booking.endMinutes;
      continue;
    }

    currentGroup.push(booking);
    currentGroupEnd = Math.max(currentGroupEnd, booking.endMinutes);
  }

  if (currentGroup.length > 0) grouped.push(currentGroup);

  const laidOut: BookingTimelineEvent[] = [];

  for (const group of grouped) {
    const laneEnds: number[] = [];
    const laneAssignments = new Map<string, number>();

    for (const booking of group) {
      const laneIndex = laneEnds.findIndex((endMinutes) => endMinutes <= booking.startMinutes);
      const resolvedLaneIndex = laneIndex === -1 ? laneEnds.length : laneIndex;
      laneEnds[resolvedLaneIndex] = booking.endMinutes;
      laneAssignments.set(booking.id, resolvedLaneIndex);
    }

    const laneCount = laneEnds.length;
    for (const booking of group) {
      laidOut.push({
        ...booking,
        laneIndex: laneAssignments.get(booking.id) ?? 0,
        laneCount,
      });
    }
  }

  return laidOut;
}

function buildTimelineEvents(
  selectedDateKey: string,
  timezone: string,
  slotGranularityMinutes: number,
  businessHours: TenantBusinessHours,
  bookings: readonly StaffBookingCardResponse[],
  closures: readonly ScheduleClosure[],
  openings: readonly ScheduleOpening[],
  slotHeightScale = 1,
): {
  readonly timelineStartMinutes: number;
  readonly timelineEndMinutes: number;
  readonly slotCount: number;
  readonly slotHeight: number;
  readonly events: TimelineEvent[];
} {
  const selectedOpening = openings.find((opening) => opening.date === selectedDateKey) ?? null;
  const regularHours = getDayHoursForDate(selectedDateKey, businessHours);
  const activeHours = selectedOpening ?? regularHours;

  if (!activeHours) {
    return {
      timelineStartMinutes: 0,
      timelineEndMinutes: 0,
      slotCount: 0,
      slotHeight: getSlotHeight(slotGranularityMinutes, slotHeightScale),
      events: [],
    };
  }

  const activeStartTime = 'startTime' in activeHours ? activeHours.startTime : activeHours.open;
  const activeEndTime = 'endTime' in activeHours ? activeHours.endTime : activeHours.close;
  const timelineStartMinutes = timeToMinutes(activeStartTime);
  const timelineEndMinutes = timeToMinutes(activeEndTime);
  const slotHeight = getSlotHeight(slotGranularityMinutes, slotHeightScale);
  const slotCount = Math.max(
    1,
    Math.ceil((timelineEndMinutes - timelineStartMinutes) / slotGranularityMinutes),
  );

  const bookingEvents = assignBookingLanes(
    bookings
      .filter((booking) => getBookingDateKey(booking, timezone) === selectedDateKey)
      .map<BookingTimelineEvent>((booking) => {
        const { startTime, endTime } = getBookingTimeKey(booking, timezone);
        const startMinutes = timeToMinutes(startTime);
        const endMinutes = timeToMinutes(endTime);
        const warning = closures.some((closure) => {
          const closureStart = closure.startTime ?? activeStartTime;
          const closureEnd = closure.endTime ?? activeEndTime;
          return overlaps(
            startMinutes,
            endMinutes,
            timeToMinutes(closureStart),
            timeToMinutes(closureEnd),
          );
        });

        return {
          kind: 'booking',
          id: booking.bookingId,
          startMinutes,
          endMinutes,
          title: booking.contactName,
          subtitle: booking.serviceNames.join(', '),
          booking,
          warning,
          laneIndex: 0,
          laneCount: 1,
        };
      }),
  );

  const closureEvents = closures
    .filter((closure) => closure.date === selectedDateKey)
    .map<ClosureTimelineEvent>((closure) => {
      const startTime = closure.startTime ?? activeStartTime;
      const endTime = closure.endTime ?? activeEndTime;

      return {
        kind: 'closure',
        id: closure.id,
        startMinutes: timeToMinutes(startTime),
        endMinutes: timeToMinutes(endTime),
        title: closure.reason,
        subtitle: closure.notes ?? '',
        closure,
      };
    });

  const openingEvents: OpeningTimelineEvent[] = selectedOpening
    ? [
        {
          kind: 'opening',
          id: selectedOpening.id,
          startMinutes: timeToMinutes(selectedOpening.startTime),
          endMinutes: timeToMinutes(selectedOpening.endTime),
          title: selectedOpening.notes ?? '',
          subtitle: '',
          opening: selectedOpening,
        },
      ]
    : [];

  const events: TimelineEvent[] = [...closureEvents, ...openingEvents, ...bookingEvents].sort(
    (left, right) => left.startMinutes - right.startMinutes || right.endMinutes - left.endMinutes,
  );

  return {
    timelineStartMinutes,
    timelineEndMinutes,
    slotCount,
    slotHeight,
    events,
  };
}

function buildTimelineDayData(
  dateKey: string,
  timezone: string,
  slotGranularityMinutes: number,
  businessHours: TenantBusinessHours,
  bookings: readonly StaffBookingCardResponse[],
  closures: readonly ScheduleClosure[],
  openings: readonly ScheduleOpening[],
  slotHeightScale = 1,
): TimelineDayData {
  const selectedOpening = openings.find((opening) => opening.date === dateKey) ?? null;
  const selectedDayHours = getDayHoursForDate(dateKey, businessHours);
  const selectedDayClosed = !selectedDayHours && !selectedOpening;
  const timeline = buildTimelineEvents(
    dateKey,
    timezone,
    slotGranularityMinutes,
    businessHours,
    bookings,
    closures,
    openings,
    slotHeightScale,
  );

  return {
    selectedOpening,
    selectedDayHours,
    selectedDayClosed,
    timelineStartMinutes: timeline.timelineStartMinutes,
    timelineEndMinutes: timeline.timelineEndMinutes,
    slotCount: timeline.slotCount,
    slotHeight: timeline.slotHeight,
    events: timeline.events,
  };
}

function buildBlockStyle(
  startMinutes: number,
  endMinutes: number,
  timelineStartMinutes: number,
  slotGranularityMinutes: number,
  slotHeight: number,
): { top: string; height: string } {
  const clampedStart = Math.max(startMinutes, timelineStartMinutes);
  const clampedEnd = Math.max(clampedStart + slotGranularityMinutes, endMinutes);
  const top = ((clampedStart - timelineStartMinutes) / slotGranularityMinutes) * slotHeight;
  const height =
    getEventMinutes(clampedStart, clampedEnd, slotGranularityMinutes) / slotGranularityMinutes;

  return {
    top: `${top}px`,
    height: `${height * slotHeight}px`,
  };
}

function getClosureReasonLabel(
  t: (key: 'reasonDayOff' | 'reasonMaintenance' | 'reasonHoliday') => string,
  reason: ScheduleClosure['reason'],
): string {
  if (reason === 'MAINTENANCE') return t('reasonMaintenance');
  if (reason === 'HOLIDAY') return t('reasonHoliday');
  return t('reasonDayOff');
}

function normalizeScheduleStatuses(statuses: readonly BookingStatus[]): readonly BookingStatus[] {
  const selected = new Set(statuses);
  return SCHEDULE_BOOKING_STATUS_OPTIONS.filter((status) => selected.has(status));
}

const BOOKING_TIMELINE_CLASSES: Record<BookingStatus, string> = {
  PENDING: 'bg-yellow-50 text-yellow-950',
  INFO_REQUESTED: 'bg-blue-50 text-blue-950',
  APPROVED: 'bg-green-50 text-green-950',
  REJECTED: 'bg-red-50 text-red-950',
  CANCELLED: 'bg-gray-100 text-gray-700',
  COMPLETED: 'bg-slate-100 text-slate-700',
};

export function SchedulePage({
  initialClosures,
  initialOpenings,
  initialBookings,
  businessHours,
  todayKey,
  weekStartKey: initialWeekStartKey,
  initialSelectedDateKey,
  slotGranularityMinutes,
}: SchedulePageProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');
  const bookingCardT = useTranslations('dashboard.bookingCard');
  const { formatDateLong, formatWeekdayShort, timezone } = useFormatting();
  const statusLabels = buildBookingStatusLabels(bookingCardT);

  const createClosureMutation = useCreateClosure();
  const createOpeningMutation = useCreateOpening();
  const removeClosureMutation = useRemoveClosure();
  const removeOpeningMutation = useRemoveOpening();

  const [weekStartKey, setWeekStartKey] = useState(initialWeekStartKey);
  const [selectedDateKey, setSelectedDateKey] = useState(initialSelectedDateKey ?? todayKey);
  const [closureSheetOpen, setClosureSheetOpen] = useState(false);
  const [openingSheetOpen, setOpeningSheetOpen] = useState(false);
  const [closureWarning, setClosureWarning] = useState<string | null>(null);
  const [removeClosureTarget, setRemoveClosureTarget] = useState<ScheduleClosure | null>(null);
  const [removeOpeningTarget, setRemoveOpeningTarget] = useState<ScheduleOpening | null>(null);
  const [viewModeOverride, setViewModeOverride] = useState<'day' | 'week' | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<readonly BookingStatus[]>(
    SCHEDULE_BOOKING_STATUS_DEFAULT,
  );
  const [statusFilterOpen, setStatusFilterOpen] = useState(false);
  const statusFilterRef = useRef<HTMLDivElement>(null);

  const weekEndKey = useMemo(() => getWeekEndKey(weekStartKey), [weekStartKey]);
  const weekDates = useMemo(() => getWeekDates(weekStartKey), [weekStartKey]);

  const { data: closures = initialClosures } = useScheduleClosures(
    weekStartKey,
    weekEndKey,
    initialClosures,
  );
  const { data: openings = initialOpenings } = useScheduleOpenings(
    weekStartKey,
    weekEndKey,
    initialOpenings,
  );
  const { data: bookings = initialBookings } = useWeekBookings(
    weekStartKey,
    weekEndKey,
    initialBookings,
  );

  const visibleClosures = closures.items;
  const visibleOpenings = openings.items;
  const selectedStatusSet = useMemo(() => new Set(selectedStatuses), [selectedStatuses]);
  const visibleBookings = useMemo(
    () => bookings.items.filter((booking) => selectedStatusSet.has(booking.status)),
    [bookings.items, selectedStatusSet],
  );

  const weekDayInfo = useMemo(
    () =>
      weekDates.map((dateKey) => {
        const opening = visibleOpenings.find((item) => item.date === dateKey) ?? null;
        const hours = getDayHoursForDate(dateKey, businessHours);
        const isClosed = !hours && !opening;
        return { dateKey, opening, hours, isClosed };
      }),
    [businessHours, visibleOpenings, weekDates],
  );

  useEffect(() => {
    if (!statusFilterOpen) return;

    function handleDocumentMouseDown(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (statusFilterRef.current?.contains(target)) return;
      setStatusFilterOpen(false);
    }

    function handleDocumentKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        setStatusFilterOpen(false);
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [statusFilterOpen]);

  const activeDates = useMemo(() => {
    const dates = new Set<string>();
    for (const booking of visibleBookings) {
      dates.add(getBookingDateKey(booking, timezone));
    }
    for (const opening of visibleOpenings) {
      dates.add(opening.date);
    }
    for (const closure of visibleClosures) {
      dates.add(closure.date);
    }
    return dates;
  }, [timezone, visibleBookings, visibleClosures, visibleOpenings]);

  const dimmedDates = useMemo(
    () => new Set(weekDayInfo.filter((day) => day.isClosed).map((day) => day.dateKey)),
    [weekDayInfo],
  );
  const isDesktopSchedule = useMediaQuery('(min-width: 1024px)');
  const defaultViewMode = isDesktopSchedule ? 'week' : 'day';
  const scheduleViewMode = viewModeOverride ?? defaultViewMode;
  const isWeekView = scheduleViewMode === 'week';

  const selectedDayTimeline = useMemo(
    () =>
      buildTimelineDayData(
        selectedDateKey,
        timezone,
        slotGranularityMinutes,
        businessHours,
        visibleBookings,
        visibleClosures,
        visibleOpenings,
      ),
    [
      businessHours,
      selectedDateKey,
      slotGranularityMinutes,
      timezone,
      visibleBookings,
      visibleClosures,
      visibleOpenings,
    ],
  );

  const weekTimelineCards = useMemo(
    () =>
      weekDayInfo.map((day) =>
        buildTimelineDayData(
          day.dateKey,
          timezone,
          slotGranularityMinutes,
          businessHours,
          visibleBookings,
          visibleClosures,
          visibleOpenings,
          0.45,
        ),
      ),
    [
      businessHours,
      slotGranularityMinutes,
      timezone,
      visibleBookings,
      visibleClosures,
      visibleOpenings,
      weekDayInfo,
    ],
  );

  const selectedDayLabel = useMemo(
    () => formatDateLong(parseDateKey(selectedDateKey)),
    [formatDateLong, selectedDateKey],
  );

  const selectedOpening = selectedDayTimeline.selectedOpening;
  const selectedDayClosed = selectedDayTimeline.selectedDayClosed;
  const timelineStartMinutes = selectedDayTimeline.timelineStartMinutes;
  const slotCount = selectedDayTimeline.slotCount;
  const events = selectedDayTimeline.events;

  const bookingEvents = events.filter((event) => event.kind === 'booking');
  const hasBookingInSelectedDay = bookingEvents.length > 0;
  const timelineTitle = selectedOpening
    ? t('specialOpeningBadge')
    : selectedDayClosed
      ? t('statusClosed')
      : t('statusRegularOpen');

  async function handleCreateClosure(body: CreateClosureRequest): Promise<ScheduleClosure> {
    const dayHours = getDayHoursForDate(body.date, businessHours);
    const created = await createClosureMutation.mutateAsync(body);
    const overlapCount = visibleBookings.filter((booking) => {
      if (getBookingDateKey(booking, timezone) !== body.date) return false;
      const { startTime, endTime } = getBookingTimeKey(booking, timezone);
      const bookingStart = timeToMinutes(startTime);
      const bookingEnd = timeToMinutes(endTime);
      const start = body.startTime ?? dayHours?.open ?? '00:00';
      const end = body.endTime ?? dayHours?.close ?? '23:59';
      return overlaps(bookingStart, bookingEnd, timeToMinutes(start), timeToMinutes(end));
    }).length;

    setWeekStartKey(getWeekStartKey(body.date));
    setSelectedDateKey(body.date);
    setClosureWarning(overlapCount > 0 ? t('closureWarning', { count: overlapCount }) : null);
    setClosureSheetOpen(false);
    return created;
  }

  async function handleCreateOpening(body: CreateOpeningRequest): Promise<ScheduleOpening> {
    const created = await createOpeningMutation.mutateAsync(body);
    setWeekStartKey(getWeekStartKey(body.date));
    setSelectedDateKey(body.date);
    setOpeningSheetOpen(false);
    return created;
  }

  async function handleRemoveClosure(id: string): Promise<void> {
    await removeClosureMutation.mutateAsync(id);
    setRemoveClosureTarget(null);
  }

  async function handleRemoveOpening(id: string): Promise<void> {
    await removeOpeningMutation.mutateAsync(id);
    setRemoveOpeningTarget(null);
  }

  function handlePrevWeek(): void {
    const nextWeekStartKey = buildWeekShift(weekStartKey, -7);
    setWeekStartKey(nextWeekStartKey);
    setSelectedDateKey(nextWeekStartKey);
    setClosureWarning(null);
    setClosureSheetOpen(false);
    setOpeningSheetOpen(false);
    setStatusFilterOpen(false);
  }

  function handleNextWeek(): void {
    const nextWeekStartKey = buildWeekShift(weekStartKey, 7);
    setWeekStartKey(nextWeekStartKey);
    setSelectedDateKey(nextWeekStartKey);
    setClosureWarning(null);
    setClosureSheetOpen(false);
    setOpeningSheetOpen(false);
    setStatusFilterOpen(false);
  }

  function handleGoToToday(): void {
    const currentWeekStartKey = getWeekStartKey(todayKey);
    setWeekStartKey(currentWeekStartKey);
    setSelectedDateKey(todayKey);
    setClosureWarning(null);
    setClosureSheetOpen(false);
    setOpeningSheetOpen(false);
    setStatusFilterOpen(false);
  }

  function handleToggleStatus(status: BookingStatus): void {
    setSelectedStatuses((current) => {
      const next = new Set(current);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return normalizeScheduleStatuses([...next]);
    });
  }

  function handleResetStatusFilter(): void {
    setSelectedStatuses(SCHEDULE_BOOKING_STATUS_DEFAULT);
  }

  const slotLabels = useMemo(
    () =>
      Array.from({ length: slotCount }, (_, index) =>
        minutesToTime(timelineStartMinutes + index * slotGranularityMinutes),
      ),
    [slotCount, slotGranularityMinutes, timelineStartMinutes],
  );
  const scheduleReturnTo = `/dashboard/schedule?weekStart=${encodeURIComponent(
    weekStartKey,
  )}&date=${encodeURIComponent(selectedDateKey)}`;

  function renderTimelineEvent(
    event: TimelineEvent,
    timeline: TimelineDayData,
    compact: boolean,
  ): React.JSX.Element {
    const blockStyle = buildBlockStyle(
      event.startMinutes,
      event.endMinutes,
      timeline.timelineStartMinutes,
      slotGranularityMinutes,
      timeline.slotHeight,
    );
    const commonClass = compact
      ? 'absolute overflow-hidden rounded-xl px-2 py-1.5 shadow-sm'
      : 'absolute overflow-hidden rounded-2xl px-3 py-2 shadow-sm';

    if (event.kind === 'booking') {
      const laneWidth = 100 / event.laneCount;
      const laneLeft = laneWidth * event.laneIndex;
      return (
        <Link
          key={event.id}
          href={`/dashboard/bookings/${event.booking.bookingId}?returnTo=${encodeURIComponent(
            scheduleReturnTo,
          )}`}
          className={cn(
            commonClass,
            'z-20 hover:shadow-md',
            event.warning
              ? 'border-orange-300 bg-orange-50 text-orange-950'
              : BOOKING_TIMELINE_CLASSES[event.booking.status],
          )}
          style={{
            ...blockStyle,
            left: `${laneLeft}%`,
            width: `${laneWidth}%`,
          }}
          aria-label={event.booking.contactName}
        >
          <div className="flex h-full flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                {event.warning ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                ) : null}
                <div className="min-w-0">
                  <p className={cn('truncate font-semibold', compact ? 'text-xs' : 'text-sm')}>
                    {event.title}
                  </p>
                  <p className={cn('truncate opacity-80', compact ? 'text-[0.65rem]' : 'text-xs')}>
                    {event.subtitle}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'shrink-0 border-0',
                  compact ? 'text-[0.62rem]' : 'text-[0.6875rem]',
                  BOOKING_STATUS_CLASSES[event.booking.status],
                )}
              >
                {statusLabels[event.booking.status]}
              </Badge>
            </div>
            <div className={cn('opacity-80', compact ? 'text-[0.625rem]' : 'text-[0.6875rem]')}>
              {formatEventRange(
                getLocalTimeKey(new Date(event.booking.scheduledAt), timezone),
                getLocalTimeKey(
                  new Date(
                    new Date(event.booking.scheduledAt).getTime() +
                      event.booking.totalDurationMins * 60_000,
                  ),
                  timezone,
                ),
              )}
            </div>
          </div>
        </Link>
      );
    }

    if (event.kind === 'opening') {
      return (
        <button
          key={event.id}
          type="button"
          onClick={() => setRemoveOpeningTarget(event.opening)}
          className={cn(
            commonClass,
            'z-10 border-emerald-200 bg-emerald-50 text-emerald-950 hover:bg-emerald-100',
          )}
          style={blockStyle}
        >
          <div className="flex h-full items-start gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div className="min-w-0 text-left">
              <p className={cn('truncate font-semibold', compact ? 'text-xs' : 'text-sm')}>
                {t('specialOpeningBadge')}
              </p>
              <p className={cn('truncate opacity-80', compact ? 'text-[0.625rem]' : 'text-xs')}>
                {event.opening.notes ??
                  formatEventRange(event.opening.startTime, event.opening.endTime)}
              </p>
            </div>
          </div>
        </button>
      );
    }

    return (
      <button
        key={event.id}
        type="button"
        onClick={() => setRemoveClosureTarget(event.closure)}
        className={cn(commonClass, 'z-10 border-slate-200 text-slate-900 hover:bg-slate-100')}
        style={{
          ...blockStyle,
          backgroundImage:
            'repeating-linear-gradient(135deg, rgba(148,163,184,0.18) 0, rgba(148,163,184,0.18) 8px, rgba(248,250,252,0.95) 8px, rgba(248,250,252,0.95) 16px)',
        }}
      >
        <div className="flex h-full items-start gap-2">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
          <div className="min-w-0 text-left">
            <p className={cn('truncate font-semibold', compact ? 'text-xs' : 'text-sm')}>
              {getClosureReasonLabel(t, event.closure.reason)}
            </p>
            <p className={cn('truncate opacity-80', compact ? 'text-[0.625rem]' : 'text-xs')}>
              {event.closure.startTime && event.closure.endTime
                ? formatEventRange(event.closure.startTime, event.closure.endTime)
                : t('allDay')}
            </p>
          </div>
        </div>
      </button>
    );
  }

  function renderTimelineBoard(timeline: TimelineDayData, compact: boolean): React.JSX.Element {
    const timelineHeight = timeline.slotCount * timeline.slotHeight;
    const bookingCount = timeline.events.filter((event) => event.kind === 'booking').length;
    const hasHours = !timeline.selectedDayClosed;

    if (!hasHours) {
      return (
        <div
          className={cn(
            'flex items-center justify-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 text-center',
            compact ? 'min-h-[10rem]' : 'min-h-[14rem] p-6',
          )}
        >
          <div className="space-y-2">
            <div
              className={cn(
                'mx-auto flex items-center justify-center rounded-full bg-gray-100 text-gray-500',
                compact ? 'h-8 w-8' : 'mb-3 h-11 w-11',
              )}
            >
              <Unlock className={cn(compact ? 'h-4 w-4' : 'h-5 w-5')} />
            </div>
            <p className={cn('font-semibold text-gray-900', compact ? 'text-xs' : 'text-sm')}>
              {t('statusClosed')}
            </p>
            <p className={cn('text-gray-500', compact ? 'text-[0.625rem]' : 'text-sm')}>
              {t('closedDayEmpty')}
            </p>
          </div>
        </div>
      );
    }

    if (compact) {
      const compactLabelStep = Math.max(1, Math.round(60 / slotGranularityMinutes));
      const compactLabelIndexes = Array.from({ length: timeline.slotCount }, (_, index) => index)
        .filter((index) => index % compactLabelStep === 0)
        .filter((index, position, indexes) => indexes.indexOf(index) === position);

      return (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge
              className={cn(
                'border-0',
                timeline.selectedOpening
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-gray-100 text-gray-700',
              )}
            >
              {timeline.selectedOpening ? t('specialOpeningBadge') : t('statusRegularOpen')}
            </Badge>
            {bookingCount > 0 ? (
              <span className="text-[0.625rem] font-medium uppercase tracking-[0.08em] text-gray-500">
                {t('bookingsOnDay', { count: bookingCount })}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-0">
            <div className="relative" style={{ height: `${timelineHeight}px` }}>
              {compactLabelIndexes.map((index) => (
                <div
                  key={`compact-label-${timeline.timelineStartMinutes}-${index}`}
                  className="absolute left-0 -translate-y-1/2 pr-2 text-[0.625rem] font-semibold text-gray-400"
                  style={{ top: `${index * timeline.slotHeight}px` }}
                >
                  {minutesToTime(timeline.timelineStartMinutes + index * slotGranularityMinutes)}
                </div>
              ))}
            </div>

            <div
              className="relative rounded-2xl border border-gray-200 bg-gray-50"
              style={{ height: `${timelineHeight}px` }}
            >
              {Array.from({ length: timeline.slotCount }, (_, index) => (
                <div
                  key={`compact-line-${timeline.timelineStartMinutes}-${index}`}
                  className="absolute inset-x-0 border-t border-gray-200"
                  style={{ top: `${index * timeline.slotHeight}px` }}
                />
              ))}

              {timeline.events.map((event) => renderTimelineEvent(event, timeline, true))}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-0">
        <div className="relative" style={{ height: `${timelineHeight}px` }}>
          {slotLabels.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="flex items-start pr-2 pt-1 text-[0.6875rem] font-semibold text-gray-400"
              style={{ height: `${timeline.slotHeight}px` }}
            >
              {label}
            </div>
          ))}
        </div>

        <div
          className="relative rounded-2xl border border-gray-200 bg-gray-50"
          style={{ height: `${timelineHeight}px` }}
        >
          {Array.from({ length: timeline.slotCount }, (_, index) => (
            <div
              key={`line-${timeline.timelineStartMinutes}-${index}`}
              className="absolute inset-x-0 border-t border-gray-200"
              style={{ top: `${index * timeline.slotHeight}px` }}
            />
          ))}

          {timeline.events.map((event) => renderTimelineEvent(event, timeline, false))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 pb-8">
      <WeekNav
        windowStart={toLocalDate(weekStartKey)}
        windowDays={7}
        today={toLocalDate(todayKey)}
        onPrev={handlePrevWeek}
        onNext={handleNextWeek}
        selectedDate={selectedDateKey}
        onSelectDate={(dateKey) => {
          setSelectedDateKey(dateKey);
          setClosureWarning(null);
        }}
        activeDates={activeDates}
        dimmedDates={dimmedDates}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
              {t('selectedDayLabel')}
            </p>
            <h1 className="text-lg font-semibold text-gray-900">{selectedDayLabel}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={handleGoToToday}>
              {t('today')}
            </Button>
            <Select
              value={scheduleViewMode}
              onValueChange={(value) => {
                setViewModeOverride(value as 'day' | 'week');
              }}
            >
              <SelectTrigger aria-label={t('viewModeLabel')} className="h-9 w-28 rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">{t('viewModeDay')}</SelectItem>
                <SelectItem value="week">{t('viewModeWeek')}</SelectItem>
              </SelectContent>
            </Select>
            {selectedDayClosed ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setClosureWarning(null);
                  setOpeningSheetOpen(true);
                  setClosureSheetOpen(false);
                }}
              >
                <Plus className="h-4 w-4" />
                {t('openSpecialDay')}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setClosureWarning(null);
                  setClosureSheetOpen(true);
                  setOpeningSheetOpen(false);
                }}
              >
                <Plus className="h-4 w-4" />
                {t('blockPeriod')}
              </Button>
            )}
          </div>
        </div>

        {closureWarning && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm">{closureWarning}</p>
          </div>
        )}

        {hasBookingInSelectedDay && (
          <div className="flex flex-wrap gap-2">
            <Badge className="border-0 bg-blue-100 text-blue-800">
              {t('bookingsOnDay', { count: bookingEvents.length })}
            </Badge>
          </div>
        )}
      </div>

      {isWeekView ? (
        <div className="space-y-3" data-testid="schedule-week-view">
          <div className="grid gap-3 lg:grid-cols-7">
            {weekDayInfo.map((day, index) => {
              const timeline = weekTimelineCards[index];
              const isSelected = day.dateKey === selectedDateKey;
              const isToday = day.dateKey === todayKey;

              return (
                <section
                  key={day.dateKey}
                  data-testid="schedule-week-day-card"
                  className={cn(
                    'overflow-hidden rounded-2xl border bg-white shadow-sm',
                    isSelected ? 'border-blue-200 ring-2 ring-blue-100' : 'border-gray-200',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDateKey(day.dateKey);
                      setClosureWarning(null);
                    }}
                    className={cn(
                      'flex w-full items-start justify-between gap-2 px-3 py-3 text-left transition-colors hover:bg-blue-50/50',
                      isSelected ? 'bg-blue-50/70' : '',
                    )}
                  >
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'text-[0.6875rem] font-semibold uppercase tracking-wide',
                          isToday ? 'text-blue-600' : 'text-gray-400',
                        )}
                      >
                        {formatWeekdayShort(toLocalDate(day.dateKey))}
                      </p>
                      <p
                        className={cn(
                          'text-sm font-semibold leading-none',
                          isSelected
                            ? 'text-blue-700'
                            : isToday
                              ? 'text-blue-600'
                              : 'text-gray-900',
                        )}
                      >
                        {toLocalDate(day.dateKey).getDate()}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        'shrink-0 border-0 text-[0.625rem]',
                        timeline.selectedOpening
                          ? 'bg-emerald-100 text-emerald-800'
                          : day.isClosed
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-blue-100 text-blue-800',
                      )}
                    >
                      {timeline.selectedOpening
                        ? t('specialOpeningBadge')
                        : day.isClosed
                          ? t('statusClosed')
                          : t('statusRegularOpen')}
                    </Badge>
                  </button>

                  <div className="border-t border-gray-100 p-3">
                    {renderTimelineBoard(timeline, true)}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <Card className="overflow-hidden" data-testid="schedule-mobile-view">
          <div className="p-4">
            <div className="mb-3 flex items-center justify-end gap-3">
              <Badge
                className={cn(
                  'border-0',
                  selectedOpening ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-700',
                )}
              >
                {timelineTitle}
              </Badge>
            </div>

            {renderTimelineBoard(selectedDayTimeline, false)}
          </div>
        </Card>
      )}

      <div
        ref={statusFilterRef}
        className="fixed bottom-24 right-4 z-30 w-fit max-w-[calc(100vw-2rem)] lg:bottom-6 lg:right-6"
      >
        <Button
          type="button"
          aria-label={t('statusFilterTrigger')}
          aria-haspopup="menu"
          aria-expanded={statusFilterOpen}
          onClick={() => setStatusFilterOpen((current) => !current)}
          className="h-auto w-fit justify-between rounded-full border border-blue-500/20 bg-blue-600 px-3 py-2.5 text-left text-white shadow-lg hover:bg-blue-600/90"
        >
          <div className="flex min-w-0 items-center gap-2">
            <Filter className="h-4 w-4 shrink-0" />
            <span className="truncate text-sm font-semibold leading-tight">
              {t('statusFilterTrigger')}
            </span>
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform',
              statusFilterOpen && 'rotate-180',
            )}
          />
        </Button>

        {statusFilterOpen ? (
          <div className="absolute bottom-full right-0 mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
            <div className="px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{t('statusFilterMenuTitle')}</p>
              <p className="mt-1 text-xs text-gray-500">{t('statusFilterMenuDescription')}</p>
            </div>
            <div className="max-h-72 overflow-y-auto border-y border-gray-100 px-2 py-2">
              {SCHEDULE_BOOKING_STATUS_OPTIONS.map((status) => (
                <label
                  key={status}
                  className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedStatusSet.has(status)}
                    onChange={() => handleToggleStatus(status)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="min-w-0 flex-1 text-sm font-medium text-gray-900">
                    {statusLabels[status]}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <Button type="button" variant="ghost" size="sm" onClick={handleResetStatusFilter}>
                {t('statusFilterReset')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStatusFilterOpen(false)}
              >
                {t('statusFilterDone')}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <ClosureFormSheet
        key={`closure-${closureSheetOpen}-${selectedDateKey}`}
        open={closureSheetOpen}
        initialDate={selectedDateKey}
        todayKey={todayKey}
        timezone={businessHours.timezone}
        slotGranularityMinutes={slotGranularityMinutes}
        onClose={() => setClosureSheetOpen(false)}
        onSubmit={handleCreateClosure}
      />

      <OpeningFormSheet
        key={`opening-${openingSheetOpen}-${selectedDateKey}`}
        open={openingSheetOpen}
        initialDate={selectedDateKey}
        todayKey={todayKey}
        timezone={businessHours.timezone}
        slotGranularityMinutes={slotGranularityMinutes}
        onClose={() => setOpeningSheetOpen(false)}
        onSubmit={handleCreateOpening}
      />

      <RemoveClosureDialog
        open={removeClosureTarget !== null}
        target={removeClosureTarget}
        onClose={() => setRemoveClosureTarget(null)}
        onSubmit={handleRemoveClosure}
      />

      <RemoveOpeningDialog
        open={removeOpeningTarget !== null}
        target={removeOpeningTarget}
        onClose={() => setRemoveOpeningTarget(null)}
        onSubmit={handleRemoveOpening}
      />
    </div>
  );
}
