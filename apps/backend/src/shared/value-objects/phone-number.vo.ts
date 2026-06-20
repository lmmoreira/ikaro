const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

export class PhoneNumber {
  private constructor(private readonly _value: string) {}

  static isValid(phone: string): boolean {
    return E164_PATTERN.test(phone);
  }

  static create(phone: string): PhoneNumber {
    if (!PhoneNumber.isValid(phone)) {
      throw new Error(
        `"${phone}" is not a valid phone number — expected E.164 format (e.g. +5511912345678)`,
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
