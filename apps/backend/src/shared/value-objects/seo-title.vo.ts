import { SeoErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../domain/domain-error-shape';

export class SeoTitleValidationError extends Error implements DomainErrorShape {
  readonly code: typeof SeoErrorCode.TITLE_TOO_LONG;

  constructor(message: string, code: typeof SeoErrorCode.TITLE_TOO_LONG) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'SeoTitleValidationError';
    this.code = code;
  }
}

export class SeoTitle {
  static readonly MAX_LENGTH = 60;

  private constructor(private readonly _value: string) {}

  static isValid(title: string): boolean {
    return title.length <= SeoTitle.MAX_LENGTH;
  }

  static create(title: string): SeoTitle {
    if (!SeoTitle.isValid(title)) {
      throw new SeoTitleValidationError(
        `"${title}" exceeds the maximum SEO title length of ${SeoTitle.MAX_LENGTH}`,
        SeoErrorCode.TITLE_TOO_LONG,
      );
    }
    return new SeoTitle(title);
  }

  static reconstitute(title: string): SeoTitle {
    return new SeoTitle(title);
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
