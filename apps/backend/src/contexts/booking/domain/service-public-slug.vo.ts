import { ServicePublicSlugInvalidError } from './errors/booking-domain.error';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 60;
// A name with no usable letters or digits (an emoji, a symbol) still needs a valid address.
const FALLBACK_BASE = 'servico';

// The address segment of a service's public page: /{tenantSlug}/servicos/{slug}. A manager never
// types it — it is derived from the service name on the first publish and never changes after
// (service.aggregate.ts keeps it across renames and unpublishing, so a published URL stays stable).
export class ServicePublicSlug {
  private constructor(private readonly _value: string) {}

  static create(raw: string): ServicePublicSlug {
    const value = raw.trim().toLowerCase();
    if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) {
      throw new ServicePublicSlugInvalidError('length');
    }
    if (!SLUG_PATTERN.test(value)) throw new ServicePublicSlugInvalidError('format');
    return new ServicePublicSlug(value);
  }

  static reconstitute(value: string): ServicePublicSlug {
    return new ServicePublicSlug(value);
  }

  // `uniqueSuffix` is appended (after a hyphen) when the plain slug is already used by another
  // service of the tenant; the caller passes a piece of the service id so the result is
  // deterministic. The base is shortened first so the whole slug always fits the 60-character cap.
  static fromName(name: string, uniqueSuffix?: string): ServicePublicSlug {
    const base = ServicePublicSlug.slugify(
      name,
      uniqueSuffix ? MAX_LENGTH - 1 - uniqueSuffix.length : MAX_LENGTH,
    );
    const padded = base.length >= MIN_LENGTH ? base : FALLBACK_BASE;
    return ServicePublicSlug.create(uniqueSuffix ? `${padded}-${uniqueSuffix}` : padded);
  }

  private static slugify(name: string, maxLength: number): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, maxLength)
      .replace(/-+$/g, '');
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }
}
