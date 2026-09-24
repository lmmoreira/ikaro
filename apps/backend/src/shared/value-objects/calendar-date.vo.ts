import { CalendarDateErrorCode } from '@ikaro/types/protocol/errors';
import { isValidCalendarDate } from '@ikaro/validation';
import { DomainErrorShape } from '../domain/domain-error-shape';
import { todayUTC } from '../utils/calendar-date';

export class CalendarDateValidationError extends Error implements DomainErrorShape {
  readonly code: CalendarDateErrorCode;

  constructor(message: string, code: CalendarDateErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'CalendarDateValidationError';
    this.code = code;
  }
}

/** A real YYYY-MM-DD calendar date (no time, no timezone) — rejects shape-valid impossible dates like 2026-02-30. */
export class CalendarDate {
  private constructor(private readonly _value: string) {}

  static isValid(date: string): boolean {
    return isValidCalendarDate(date);
  }

  static create(date: string): CalendarDate {
    if (!CalendarDate.isValid(date)) {
      throw new CalendarDateValidationError(
        `"${date}" is not a valid calendar date — expected YYYY-MM-DD`,
        CalendarDateErrorCode.FORMAT_INVALID,
      );
    }
    return new CalendarDate(date);
  }

  static reconstitute(date: string): CalendarDate {
    return new CalendarDate(date);
  }

  /** Today's date in UTC. */
  static today(): CalendarDate {
    return new CalendarDate(todayUTC());
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }

  // Zero-padded YYYY-MM-DD strings order lexicographically in calendar order.
  isBefore(other: CalendarDate): boolean {
    return this._value < other._value;
  }
}
