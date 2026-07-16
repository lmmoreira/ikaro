import { HexColorErrorCode } from '@ikaro/types';
import { isValidHexColor } from '@ikaro/validation';
import { DomainErrorShape } from '../domain/domain-error-shape';

export class HexColorValidationError extends Error implements DomainErrorShape {
  readonly code: HexColorErrorCode;

  constructor(message: string, code: HexColorErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'HexColorValidationError';
    this.code = code;
  }
}

export class HexColor {
  private constructor(private readonly _value: string) {}

  static isValid(color: string): boolean {
    return isValidHexColor(color);
  }

  static create(color: string): HexColor {
    if (!HexColor.isValid(color)) {
      throw new HexColorValidationError(
        `"${color}" is not a valid hex color — expected #RRGGBB`,
        HexColorErrorCode.FORMAT_INVALID,
      );
    }
    return new HexColor(color.toUpperCase());
  }

  static reconstitute(color: string): HexColor {
    return new HexColor(color.toUpperCase());
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
