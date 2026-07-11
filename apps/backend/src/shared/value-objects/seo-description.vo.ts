import { SeoErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../domain/domain-error-shape';

export class SeoDescriptionValidationError extends Error implements DomainErrorShape {
  readonly code: typeof SeoErrorCode.DESCRIPTION_TOO_LONG;

  constructor(message: string, code: typeof SeoErrorCode.DESCRIPTION_TOO_LONG) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'SeoDescriptionValidationError';
    this.code = code;
  }
}

export class SeoDescription {
  static readonly MAX_LENGTH = 158;

  private constructor(private readonly _value: string) {}

  static isValid(description: string): boolean {
    return description.length <= SeoDescription.MAX_LENGTH;
  }

  static create(description: string): SeoDescription {
    if (!SeoDescription.isValid(description)) {
      throw new SeoDescriptionValidationError(
        `"${description}" exceeds the maximum SEO description length of ${SeoDescription.MAX_LENGTH}`,
        SeoErrorCode.DESCRIPTION_TOO_LONG,
      );
    }
    return new SeoDescription(description);
  }

  static reconstitute(description: string): SeoDescription {
    return new SeoDescription(description);
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
