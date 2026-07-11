import { PhoneErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../domain/domain-error-shape';

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export class PhoneNumberValidationError extends Error implements DomainErrorShape {
  readonly code: PhoneErrorCode;

  constructor(message: string, code: PhoneErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'PhoneNumberValidationError';
    this.code = code;
  }
}

export class PhoneNumber {
  private constructor(private readonly _value: string) {}

  static isValid(phone: string): boolean {
    return E164_PATTERN.test(phone);
  }

  static create(phone: string): PhoneNumber {
    if (!PhoneNumber.isValid(phone)) {
      throw new PhoneNumberValidationError(
        `"${phone}" is not a valid phone number — expected E.164 format (e.g. +5511912345678)`,
        PhoneErrorCode.FORMAT_INVALID,
      );
    }
    return new PhoneNumber(phone);
  }

  get value(): string {
    return this._value;
  }

  format(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
