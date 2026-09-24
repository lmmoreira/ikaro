'use client';

import type {
  BookingStatus,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/utils/cn';
import type { TimelineDayData } from '@/features/booking/schedule/schedule-timeline';
import type { ScheduleWeekDayInfo } from '@/features/booking/schedule/schedule-page-derived';
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
  readonly timelineTitle: string;
}

// Extracted from SchedulePage — picks one of the three main-content views (week grid, bounded
// multi-resource columns board, or the single-day timeline), avoiding a 3-way nested ternary
// inside JSX (SonarCloud S3358). Every other piece of chrome (header, filters, sheets) stays in
// SchedulePage itself.
export function ScheduleMainView(props: ScheduleMainViewProps): React.JSX.Element {
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
        <div className="mb-3 flex items-center justify-end gap-3">
          <Badge
            className={cn(
              'border-0',
              props.selectedDayTimeline.selectedOpening
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-gray-100 text-gray-700',
            )}
          >
            {props.timelineTitle}
          </Badge>
        </div>

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
        />
      </div>
    </Card>
  );
}
