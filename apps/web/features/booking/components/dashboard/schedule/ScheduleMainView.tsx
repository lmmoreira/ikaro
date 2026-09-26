'use client';

import type {
  BookingStatus,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { Card } from '@/shared/components/ui/card';
import type { TimelineDayData } from '@/features/booking/schedule/schedule-timeline';
import type { ScheduleWeekDayInfo } from '@/features/booking/schedule/schedule-page-derived';
import { getLocalTimeKey, timeToMinutes } from '@/features/booking/schedule/date-utils';
import {
  resolveNowMarkerTopPx,
  useScrollToNowOnce,
} from '@/features/booking/schedule/schedule-scroll-to-now';
import { ScheduleResourceColumnsBoard } from './ScheduleResourceColumnsBoard';
import { ScheduleTimelineBoard } from './ScheduleTimelineBoard';
import { ScheduleWeekView } from './ScheduleWeekView';

interface ScheduleMainViewProps {
  readonly isWeekView: boolean;
  readonly showResourceColumns: boolean;
  readonly weekDayInfo: readonly ScheduleWeekDayInfo[];
  readonly weekTimelineCards: readonly TimelineDayData[];
  readonly selectedDateKey: string;
  readonly todayKey: string;
  readonly onSelectDate: (dateKey: string) => void;
  readonly slotGranularityMinutes: 15 | 30 | 60;
  readonly statusLabels: Record<BookingStatus, string>;
  readonly timezone: string;
  readonly scheduleReturnTo: string;
  readonly onOpeningClick: (opening: ScheduleOpening) => void;
  readonly onClosureClick: (closure: ScheduleClosure) => void;
  readonly selectedResourceIdSet: ReadonlySet<string>;
  readonly resourceNameById: ReadonlyMap<string, string>;
  readonly bookingsItems: readonly StaffBookingCardResponse[];
  readonly selectedStatusSet: ReadonlySet<BookingStatus>;
  readonly visibleClosures: readonly ScheduleClosure[];
  readonly visibleOpenings: readonly ScheduleOpening[];
  readonly businessHours: TenantBusinessHours;
  readonly selectedDayTimeline: TimelineDayData;
  readonly slotLabels: readonly string[];
}

// Extracted from SchedulePage — picks one of the three main-content views (week grid, bounded
// multi-resource columns board, or the single-day timeline), avoiding a 3-way nested ternary
// inside JSX (SonarCloud S3358). Every other piece of chrome (header, filters, sheets) stays in
// SchedulePage itself.
export function ScheduleMainView(props: ScheduleMainViewProps): React.JSX.Element {
  // TD44 Story 4 — scroll-to-now only ever applies to the single-timeline mobile view rendered
  // below; the marker stays unattached (ref never assigned a DOM node) whenever a different branch
  // renders instead, which keeps this a no-op for those cases without a conditional hook call.
  const isToday = props.selectedDateKey === props.todayKey;
  const nowMarkerRef = useScrollToNowOnce(isToday, props.selectedDateKey);
  const nowMarkerTopPx = resolveNowMarkerTopPx(
    props.selectedDayTimeline,
    props.slotGranularityMinutes,
    timeToMinutes(getLocalTimeKey(new Date(), props.timezone)),
  );

  if (props.isWeekView) {
    return (
      <ScheduleWeekView
        weekDayInfo={props.weekDayInfo}
        weekTimelineCards={props.weekTimelineCards}
        selectedDateKey={props.selectedDateKey}
        todayKey={props.todayKey}
        onSelectDate={props.onSelectDate}
        slotGranularityMinutes={props.slotGranularityMinutes}
        statusLabels={props.statusLabels}
        timezone={props.timezone}
        scheduleReturnTo={props.scheduleReturnTo}
        onOpeningClick={props.onOpeningClick}
        onClosureClick={props.onClosureClick}
      />
    );
  }

  if (props.showResourceColumns) {
    return (
      <ScheduleResourceColumnsBoard
        selectedResourceIdSet={props.selectedResourceIdSet}
        resourceNameById={props.resourceNameById}
        bookings={props.bookingsItems}
        selectedStatusSet={props.selectedStatusSet}
        closures={props.visibleClosures}
        openings={props.visibleOpenings}
        selectedDateKey={props.selectedDateKey}
        todayKey={props.todayKey}
        businessHours={props.businessHours}
        slotGranularityMinutes={props.slotGranularityMinutes}
        statusLabels={props.statusLabels}
        timezone={props.timezone}
        scheduleReturnTo={props.scheduleReturnTo}
        onOpeningClick={props.onOpeningClick}
        onClosureClick={props.onClosureClick}
      />
    );
  }

  return (
    <Card className="overflow-hidden" data-testid="schedule-mobile-view">
      <div className="p-4">
        <ScheduleTimelineBoard
          timeline={props.selectedDayTimeline}
          compact={false}
          slotGranularityMinutes={props.slotGranularityMinutes}
          slotLabels={props.slotLabels}
          statusLabels={props.statusLabels}
          timezone={props.timezone}
          scheduleReturnTo={props.scheduleReturnTo}
          onOpeningClick={props.onOpeningClick}
          onClosureClick={props.onClosureClick}
          nowMarkerRef={isToday ? nowMarkerRef : undefined}
          nowMarkerTopPx={isToday ? nowMarkerTopPx : undefined}
        />
      </div>
    </Card>
  );
}
