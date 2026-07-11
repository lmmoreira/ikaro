import { SlugErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../domain/domain-error-shape';

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export class SlugValidationError extends Error implements DomainErrorShape {
  readonly code: SlugErrorCode;

  constructor(message: string, code: SlugErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'SlugValidationError';
    this.code = code;
  }
}

export class Slug {
  private constructor(private readonly _value: string) {}

  static isValid(slug: string): boolean {
    return typeof slug === 'string' && slug.length > 0 && SLUG_PATTERN.test(slug);
  }

  static create(slug: string): Slug {
    if (!Slug.isValid(slug)) {
      throw new SlugValidationError(
        `"${slug}" is not a valid slug — use only lowercase letters, numbers, and hyphens`,
        SlugErrorCode.FORMAT_INVALID,
      );
    }
    return new Slug(slug);
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
