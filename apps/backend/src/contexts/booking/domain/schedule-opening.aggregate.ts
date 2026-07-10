import { BookingErrorCode } from '@ikaro/types';
import { todayUTC } from '../../../shared/utils/calendar-date';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import {
  CreatedByRequiredError,
  InvalidTimeRangeError,
  OpeningDateInPastError,
  TenantIdRequiredError,
} from './errors/booking-domain.error';

export interface ScheduleOpeningProps {
  id: string;
  tenantId: string;
  date: string;
  startTime: TimeOfDay;
  endTime: TimeOfDay;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
}

export class ScheduleOpening extends AggregateRoot {
  private readonly props: ScheduleOpeningProps;

  private constructor(props: ScheduleOpeningProps) {
    super();
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get date(): string {
    return this.props.date;
  }
  get startTime(): TimeOfDay {
    return this.props.startTime;
  }
  get endTime(): TimeOfDay {
    return this.props.endTime;
  }
  get notes(): string | null {
    return this.props.notes;
  }
  get createdBy(): string {
    return this.props.createdBy;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  static open(
    tenantId: string,
    date: string,
    startTime: string,
    endTime: string,
    createdBy: string,
    notes?: string,
  ): ScheduleOpening {
    ScheduleOpening.assertValid(tenantId, date, startTime, endTime, createdBy);
    return new ScheduleOpening({
      id: uuidv7(),
      tenantId,
      date,
      startTime: TimeOfDay.create(startTime),
      endTime: TimeOfDay.create(endTime),
      notes: notes?.trim() ?? null,
      createdBy,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: ScheduleOpeningProps): ScheduleOpening {
    return new ScheduleOpening(props);
  }

  private static assertValid(
    tenantId: string,
    date: string,
    startTime: string,
    endTime: string,
    createdBy: string,
  ): void {
    if (!tenantId) throw new TenantIdRequiredError();
    if (!createdBy) throw new CreatedByRequiredError();
    const today = todayUTC();
    if (date < today) throw new OpeningDateInPastError();
    if (!TimeOfDay.isValid(startTime) || !TimeOfDay.isValid(endTime)) {
      throw new InvalidTimeRangeError(
        'startTime and endTime must be in HH:MM format (00:00–23:59)',
        BookingErrorCode.TIME_RANGE_FORMAT_INVALID,
      );
    }
    if (!TimeOfDay.create(startTime).isBefore(TimeOfDay.create(endTime))) {
      throw new InvalidTimeRangeError(
        'endTime must be after startTime',
        BookingErrorCode.TIME_RANGE_ORDER_INVALID,
      );
    }
  }
}
