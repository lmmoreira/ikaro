'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, Plus } from 'lucide-react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/cn';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { type ScheduleViewMode } from '@/features/booking/schedule/schedule-preferences';

interface ScheduleDayHeaderProps {
  readonly selectedDayLabel: string;
  readonly bookingCount: number;
  readonly scheduleViewMode: ScheduleViewMode;
  readonly onViewModeChange: (mode: ScheduleViewMode) => void;
  readonly onGoToToday: () => void;
  readonly selectedDayClosed: boolean;
  readonly onOpenSpecialDay: () => void;
  readonly onBlockPeriod: () => void;
  readonly closureWarning: string | null;
}

// Extracted from SchedulePage (TD37-S5A) — the selected-day label, view-mode toggle, primary
// action button, and closure warning banner form one cohesive header block. TD44 Story 4: the
// booking-count badge sits inline next to the date label here — same pattern as ScheduleWeekView's
// own day-card badge (0 = muted "Sem agendamentos", 1+ = highlighted count) — instead of the
// Day-view resource-columns board's per-column empty-day text, which duplicated per column what
// this single badge now says once for the whole selected day.
export function ScheduleDayHeader({
  selectedDayLabel,
  bookingCount,
  scheduleViewMode,
  onViewModeChange,
  onGoToToday,
  selectedDayClosed,
  onOpenSpecialDay,
  onBlockPeriod,
  closureWarning,
}: ScheduleDayHeaderProps): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
            {t('selectedDayLabel')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-gray-900">{selectedDayLabel}</h1>
            <Badge
              data-testid="schedule-day-header-booking-count"
              className={cn(
                'shrink-0 border-0 text-[0.6875rem]',
                bookingCount > 0 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700',
              )}
            >
              {t('bookingsOnDay', { count: bookingCount })}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onGoToToday}>
            {t('today')}
          </Button>
          <Select
            value={scheduleViewMode}
            onValueChange={(value) => onViewModeChange(value as ScheduleViewMode)}
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
            <Button type="button" size="sm" onClick={onOpenSpecialDay}>
              <Plus className="h-4 w-4" />
              {t('openSpecialDay')}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={onBlockPeriod}>
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
    </div>
  );
}
