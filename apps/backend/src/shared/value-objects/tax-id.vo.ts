import { type TaxIdSpec, type TaxIdType } from '@ikaro/i18n';
import { SignupErrorCode } from '@ikaro/types/protocol/errors';
import { DomainErrorShape } from '../domain/domain-error-shape';
import { ValueObject } from '../domain/value-object';

interface TaxIdProps {
  value: string;
  type: TaxIdType;
}

const CPF_PATTERN = /^\d{11}$/;
const EIN_PATTERN = /^\d{9}$/;
// An alphanumeric CNPJ (Receita Federal, since July 2026): 12 alphanumeric characters followed by
// 2 numeric check digits. A numeric CNPJ is the special case where every character is a digit.
const CNPJ_PATTERN = /^[0-9A-Z]{12}\d{2}$/;
const PUNCTUATION = /[.\-/\s]/g;
const CNPJ_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_WEIGHTS_SECOND = [6, ...CNPJ_WEIGHTS];

export class TaxIdValidationError extends Error implements DomainErrorShape {
  readonly code: SignupErrorCode;

  constructor(message: string, code: SignupErrorCode) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'TaxIdValidationError';
    this.code = code;
  }
}

function allSame(value: string): boolean {
  return [...value].every((char) => char === value[0]);
}

function cpfDigit(digits: number[]): number {
  const weight = digits.length + 1;
  const sum = digits.reduce((total, digit, index) => total + digit * (weight - index), 0);
  return ((sum * 10) % 11) % 10;
}

function isValidCpf(value: string): boolean {
  if (!CPF_PATTERN.test(value) || allSame(value)) return false;
  const digits = [...value].map(Number);
  const first = cpfDigit(digits.slice(0, 9));
  const second = cpfDigit([...digits.slice(0, 9), first]);
  return first === digits[9] && second === digits[10];
}

function cnpjDigit(characters: number[], weights: number[]): number {
  const sum = characters.reduce((total, char, index) => total + char * weights[index], 0) % 11;
  return sum < 2 ? 0 : 11 - sum;
}

function isValidCnpj(value: string): boolean {
  if (!CNPJ_PATTERN.test(value) || allSame(value)) return false;
  // Each character is worth its ASCII code minus 48, so digits keep their value and 'A' is 17.
  // CNPJ_PATTERN already limited the value to ASCII digits and capitals, so codePointAt is defined.
  const characters = Array.from(value, (char) => (char.codePointAt(0) ?? 0) - 48);
  const first = cnpjDigit(characters.slice(0, 12), CNPJ_WEIGHTS);
  const second = cnpjDigit([...characters.slice(0, 12), first], CNPJ_WEIGHTS_SECOND);
  return first === characters[12] && second === characters[13];
}

function invalid(message: string): TaxIdValidationError {
  return new TaxIdValidationError(message, SignupErrorCode.TAX_ID_INVALID);
}

function required(): TaxIdValidationError {
  return new TaxIdValidationError('A tax id is required', SignupErrorCode.TAX_ID_REQUIRED);
}

function createFreeText(raw: string, spec: TaxIdSpec): TaxId {
  const value = raw.trim();
  // Counted in characters (code points), as the VARCHAR column counts them, not UTF-16 code units.
  if (spec.maxLength !== null && [...value].length > spec.maxLength) {
    throw invalid(`The tax id must have at most ${spec.maxLength} characters`);
  }
  return TaxId.reconstitute(value, 'OTHER');
}

// A US EIN is 9 digits (XX-XXXXXXX); the IRS publishes no check digit, so the shape is all there is.
const CHECKS: Readonly<Record<Exclude<TaxIdType, 'OTHER'>, (value: string) => boolean>> = {
  CPF: isValidCpf,
  CNPJ: isValidCnpj,
  EIN: (value) => EIN_PATTERN.test(value),
};

function createChecked(raw: string, types: readonly TaxIdType[]): TaxId {
  const value = raw.replace(PUNCTUATION, '').toUpperCase();
  const type = types.find((candidate) => candidate !== 'OTHER' && CHECKS[candidate](value));
  if (type === undefined) throw invalid(`The tax id is not a valid ${types.join(' or ')}`);
  return TaxId.reconstitute(value, type);
}

// The types a raw value is tried against. A declared type is the only candidate. Without one, the
// country's checked types are tried (BR: CPF then CNPJ by shape; US: EIN) — free text 'OTHER' is
// never a silent fallback, so a mistyped EIN is refused, not stored unchecked. A country whose only
// type is 'OTHER' (no rule of its own) takes free text.
function candidateTypes(spec: TaxIdSpec, declaredType: TaxIdType | undefined): TaxIdType[] {
  if (declaredType !== undefined) {
    if (!spec.types.includes(declaredType)) {
      throw invalid(`A ${declaredType} tax id is not accepted here`);
    }
    return [declaredType];
  }
  const checked = spec.types.filter((type) => type !== 'OTHER');
  return checked.length > 0 ? checked : [...spec.types];
}

/**
 * A billing tax identity. The rules come from the country's `CountrySpec.taxId`
 * (`countrySpec(code).taxId`): BR accepts a CPF or CNPJ with valid check digits (CNPJ may be
 * alphanumeric); the US an optional 9-digit EIN, or free text typed `OTHER` when the user declares
 * that type (another US document); any other country optional free text typed `OTHER`.
 */
export class TaxId extends ValueObject<TaxIdProps> {
  private constructor(props: TaxIdProps) {
    super(props);
  }

  /**
   * Builds a TaxId from a present value; a blank one is `SIGNUP_TAX_ID_REQUIRED`. `declaredType`
   * is the type the user picked; omit it where the shape tells (BR CPF vs CNPJ, a one-type country).
   */
  static create(raw: string, spec: TaxIdSpec, declaredType?: TaxIdType): TaxId {
    if (typeof raw !== 'string' || raw.trim() === '') throw required();
    const types = candidateTypes(spec, declaredType);
    return types.includes('OTHER') ? createFreeText(raw, spec) : createChecked(raw, types);
  }

  /** Like create(), for an input that may be absent: null where the country does not require one. */
  static createOptional(
    raw: string | null | undefined,
    spec: TaxIdSpec,
    declaredType?: TaxIdType,
  ): TaxId | null {
    if (raw === null || raw === undefined || raw.trim() === '') {
      if (spec.required) throw required();
      return null;
    }
    return TaxId.create(raw, spec, declaredType);
  }

  static reconstitute(value: string, type: TaxIdType): TaxId {
    return new TaxId({ value, type });
  }

  /**
   * Whether this id's type is one the country accepts (BR: CPF or CNPJ; US: EIN). `create()` can
   * only build an accepted type, so this is for an aggregate holding an id it did not build from
   * the country's own spec (one reconstituted from storage, one handed over by another caller).
   */
  isAllowedFor(spec: TaxIdSpec): boolean {
    return spec.types.includes(this.props.type);
  }

  get value(): string {
    return this.props.value;
  }

  get type(): TaxIdType {
    return this.props.type;
  }

  toString(): string {
    return this.props.value;
  }
}
