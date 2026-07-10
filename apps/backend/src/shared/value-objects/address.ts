import type { AddressSpec } from '@ikaro/i18n';
import { AddressErrorCode } from '@ikaro/types';
import { DomainErrorShape } from '../domain/domain-error-shape';
import { ValueObject } from '../domain/value-object';

export interface AddressProps {
  street: string;
  number: string;
  complement?: string;
  neighborhood?: string;
  city: string;
  state: string;
  zipCode: string;
}

export class AddressValidationError extends Error implements DomainErrorShape {
  readonly code: AddressErrorCode;
  readonly params?: Record<string, string | number>;

  constructor(message: string, code: AddressErrorCode, params?: Record<string, string | number>) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AddressValidationError';
    this.code = code;
    this.params = params;
  }
}

export class Address extends ValueObject<AddressProps> {
  private constructor(props: AddressProps) {
    super(props);
  }

  static create(props: AddressProps, spec: AddressSpec): Address {
    const normalized = Address.normalize(props);
    Address.validateRequiredFields(normalized, spec);
    Address.validateCountrySpecificRules(normalized, spec);
    return new Address(normalized);
  }

  private static normalize(props: AddressProps): AddressProps {
    const street = typeof props.street === 'string' ? props.street.trim() : '';
    const number = typeof props.number === 'string' ? props.number.trim() : '';
    const complement =
      typeof props.complement === 'string' ? props.complement.trim() || undefined : undefined;
    const neighborhood =
      typeof props.neighborhood === 'string' ? props.neighborhood.trim() || undefined : undefined;
    const city = typeof props.city === 'string' ? props.city.trim() : '';
    const state = typeof props.state === 'string' ? props.state.trim() : '';
    const zipCode = typeof props.zipCode === 'string' ? props.zipCode.trim() : '';

    return { street, number, complement, neighborhood, city, state, zipCode };
  }

  private static validateRequiredFields(props: AddressProps, spec: AddressSpec): void {
    Address.requireField(props.street, spec.streetLabel, 'street');
    Address.requireField(props.number, spec.numberLabel, 'number');
    Address.requireField(props.city, spec.cityLabel, 'city');
    Address.requireField(props.state, spec.stateLabel, 'state');
    Address.requireField(props.zipCode, spec.postalLabel, 'zipCode');
  }

  private static validateCountrySpecificRules(props: AddressProps, spec: AddressSpec): void {
    const { zipCode, state, neighborhood } = props;
    if (spec.postalRegex !== null && !spec.postalRegex.test(zipCode)) {
      throw new AddressValidationError(
        `Invalid ${spec.postalLabel}: ${zipCode}`,
        AddressErrorCode.POSTAL_CODE_INVALID,
      );
    }
    if (spec.statePattern !== null && !spec.statePattern.test(state)) {
      throw new AddressValidationError(
        `Invalid ${spec.stateLabel}: ${state}`,
        AddressErrorCode.STATE_INVALID,
      );
    }
    if (spec.requireNeighborhood && !neighborhood) {
      throw new AddressValidationError(
        `${spec.neighborhoodLabel ?? 'neighborhood'} is required`,
        AddressErrorCode.NEIGHBORHOOD_REQUIRED,
      );
    }
  }

  private static requireField(
    value: string,
    label: string,
    field: 'street' | 'number' | 'city' | 'state' | 'zipCode',
  ): void {
    if (!value) {
      throw new AddressValidationError(`${label} is required`, AddressErrorCode.FIELD_REQUIRED, {
        field,
      });
    }
  }

  static reconstitute(props: AddressProps): Address {
    return new Address(props);
  }

  toJSON(): AddressProps {
    return { ...this.props };
  }

  get street(): string {
    return this.props.street;
  }
  get number(): string {
    return this.props.number;
  }
  get complement(): string | undefined {
    return this.props.complement;
  }
  get neighborhood(): string | undefined {
    return this.props.neighborhood;
  }
  get city(): string {
    return this.props.city;
  }
  get state(): string {
    return this.props.state;
  }
  get zipCode(): string {
    return this.props.zipCode;
  }

  format(): string {
    const parts = [`${this.props.street}, ${this.props.number}`];
    if (this.props.complement) parts.push(this.props.complement);
    if (this.props.neighborhood) parts.push(this.props.neighborhood);
    parts.push(`${this.props.city} - ${this.props.state}`, this.props.zipCode);
    return parts.join(', ');
  }
}
