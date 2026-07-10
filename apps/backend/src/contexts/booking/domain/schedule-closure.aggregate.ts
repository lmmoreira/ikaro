import { BookingErrorCode } from '@ikaro/types';
import { todayUTC } from '../../../shared/utils/calendar-date';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import {
  BookingDomainError,
  ClosureDateInPastError,
  InvalidTimeRangeError,
} from './errors/booking-domain.error';

export enum ClosureReason {
  STAFF_DAY_OFF = 'STAFF_DAY_OFF',
  MAINTENANCE = 'MAINTENANCE',
  HOLIDAY = 'HOLIDAY',
}

export interface ScheduleClosureProps {
  id: string;
  tenantId: string;
  date: string;
  startTime: TimeOfDay | null;
  endTime: TimeOfDay | null;
  reason: ClosureReason;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
}

export class ScheduleClosure extends AggregateRoot {
  private readonly props: ScheduleClosureProps;

  private constructor(props: ScheduleClosureProps) {
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
  get startTime(): TimeOfDay | null {
    return this.props.startTime;
  }
  get endTime(): TimeOfDay | null {
    return this.props.endTime;
  }
  get reason(): ClosureReason {
    return this.props.reason;
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

  isFullDay(): boolean {
    return this.props.startTime === null;
  }

  /** True if this closure's window overlaps the given window. Full-day on either side always overlaps. */
  overlaps(otherStart: TimeOfDay | null, otherEnd: TimeOfDay | null): boolean {
    const myStart = this.props.startTime;
    const myEnd = this.props.endTime;
    if (myStart === null || otherStart === null) return true;
    if (myEnd === null || otherEnd === null) return true;
    return myStart.value < otherEnd.value && otherStart.value < myEnd.value;
  }

  static close(
    tenantId: string,
    date: string,
    reason: ClosureReason,
    createdBy: string,
    startTime?: string,
    endTime?: string,
    notes?: string,
  ): ScheduleClosure {
    ScheduleClosure.assertValid(tenantId, date, reason, createdBy, startTime, endTime);
    return new ScheduleClosure({
      id: uuidv7(),
      tenantId,
      date,
      startTime: startTime == null ? null : TimeOfDay.create(startTime),
      endTime: endTime == null ? null : TimeOfDay.create(endTime),
      reason,
      notes: notes?.trim() ?? null,
      createdBy,
      createdAt: new Date(),
    });
  }

  static reconstitute(props: ScheduleClosureProps): ScheduleClosure {
    return new ScheduleClosure(props);
  }

  private static assertValid(
    tenantId: string,
    date: string,
    reason: ClosureReason,
    createdBy: string,
    startTime?: string,
    endTime?: string,
  ): void {
    if (!tenantId)
      throw new BookingDomainError('tenantId is required', BookingErrorCode.TENANT_ID_REQUIRED);
    if (!createdBy) {
      throw new BookingDomainError('createdBy is required', BookingErrorCode.CREATED_BY_REQUIRED);
    }
    if (!Object.values(ClosureReason).includes(reason)) {
      throw new BookingDomainError(
        `Invalid closure reason: ${reason}`,
        BookingErrorCode.CLOSURE_REASON_INVALID,
      );
    }
    const today = todayUTC();
    if (date < today) throw new ClosureDateInPastError();
    ScheduleClosure.assertTimeRange(startTime, endTime);
  }

  private static assertTimeRange(startTime?: string, endTime?: string): void {
    const hasStart = startTime != null;
    const hasEnd = endTime != null;
    if (hasStart !== hasEnd) {
      throw new BookingDomainError(
        'startTime and endTime must both be provided or both omitted',
        BookingErrorCode.CLOSURE_TIME_RANGE_INCOMPLETE,
      );
    }
    if (startTime != null && endTime != null) {
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
}
