import { type TaxIdSpec, type TaxIdType } from '@ikaro/i18n';
import { SignupErrorCode } from '@ikaro/types/protocol/errors';
import { DomainErrorShape } from '../domain/domain-error-shape';
import { ValueObject } from '../domain/value-object';

interface TaxIdProps {
  value: string;
  type: TaxIdType;
}

const CPF_PATTERN = /^\d{11}$/;
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
  const characters = [...value].map((char) => char.charCodeAt(0) - 48);
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
  if (spec.maxLength !== null && value.length > spec.maxLength) {
    throw invalid(`The tax id must have at most ${spec.maxLength} characters`);
  }
  return TaxId.reconstitute(value, 'OTHER');
}

function createChecked(raw: string, spec: TaxIdSpec): TaxId {
  const value = raw.replace(PUNCTUATION, '').toUpperCase();
  if (spec.types.includes('CPF') && isValidCpf(value)) return TaxId.reconstitute(value, 'CPF');
  if (spec.types.includes('CNPJ') && isValidCnpj(value)) return TaxId.reconstitute(value, 'CNPJ');
  throw invalid('The tax id is not a valid CPF or CNPJ');
}

/**
 * A billing tax identity. The rules come from the country's `CountrySpec.taxId`
 * (`countrySpec(code).taxId`): BR accepts a CPF or CNPJ with valid check digits (CNPJ may be
 * alphanumeric), any other country takes optional free text typed `OTHER`.
 */
export class TaxId extends ValueObject<TaxIdProps> {
  private constructor(props: TaxIdProps) {
    super(props);
  }

  /** Builds a TaxId from a present value; a blank one is `SIGNUP_TAX_ID_REQUIRED`. */
  static create(raw: string, spec: TaxIdSpec): TaxId {
    if (typeof raw !== 'string' || raw.trim() === '') throw required();
    return spec.types.includes('OTHER') ? createFreeText(raw, spec) : createChecked(raw, spec);
  }

  /** Like create(), for an input that may be absent: null where the country does not require one. */
  static createOptional(raw: string | null | undefined, spec: TaxIdSpec): TaxId | null {
    if (raw === null || raw === undefined || raw.trim() === '') {
      if (spec.required) throw required();
      return null;
    }
    return TaxId.create(raw, spec);
  }

  static reconstitute(value: string, type: TaxIdType): TaxId {
    return new TaxId({ value, type });
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
