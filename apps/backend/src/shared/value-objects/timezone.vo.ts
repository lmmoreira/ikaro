import { TimezoneErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../domain/domain-error-shape';

export class TimezoneValidationError extends Error implements DomainErrorShape {
  readonly code: TimezoneErrorCode;

  constructor(message: string, code: TimezoneErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'TimezoneValidationError';
    this.code = code;
  }
}

export class Timezone {
  private constructor(private readonly _value: string) {}

  static isValid(tz: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  static create(tz: string): Timezone {
    if (!Timezone.isValid(tz)) {
      throw new TimezoneValidationError(
        `"${tz}" is not a valid IANA timezone`,
        TimezoneErrorCode.INVALID,
      );
    }
    return new Timezone(tz);
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
