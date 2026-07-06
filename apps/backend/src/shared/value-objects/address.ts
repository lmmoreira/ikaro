import type { AddressSpec } from '@ikaro/i18n';
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

export class AddressValidationError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AddressValidationError';
  }
}

export class Address extends ValueObject<AddressProps> {
  private constructor(props: AddressProps) {
    super(props);
  }

  static create(props: AddressProps, spec: AddressSpec): Address {
    const street = typeof props.street === 'string' ? props.street.trim() : '';
    const number = typeof props.number === 'string' ? props.number.trim() : '';
    const complement =
      typeof props.complement === 'string' ? props.complement.trim() || undefined : undefined;
    const neighborhood =
      typeof props.neighborhood === 'string' ? props.neighborhood.trim() || undefined : undefined;
    const city = typeof props.city === 'string' ? props.city.trim() : '';
    const state = typeof props.state === 'string' ? props.state.trim() : '';
    const zipCode = typeof props.zipCode === 'string' ? props.zipCode.trim() : '';

    if (!street) {
      throw new AddressValidationError(`${spec.streetLabel} is required`);
    }
    if (!number) {
      throw new AddressValidationError(`${spec.numberLabel} is required`);
    }
    if (!city) {
      throw new AddressValidationError(`${spec.cityLabel} is required`);
    }
    if (!state) {
      throw new AddressValidationError(`${spec.stateLabel} is required`);
    }
    if (!zipCode) {
      throw new AddressValidationError(`${spec.postalLabel} is required`);
    }
    if (spec.postalRegex !== null && !spec.postalRegex.test(zipCode)) {
      throw new AddressValidationError(`Invalid ${spec.postalLabel}: ${props.zipCode}`);
    }
    if (spec.statePattern !== null && !spec.statePattern.test(state)) {
      throw new AddressValidationError(`Invalid ${spec.stateLabel}: ${props.state}`);
    }
    if (spec.requireNeighborhood && !neighborhood) {
      throw new AddressValidationError(`${spec.neighborhoodLabel ?? 'neighborhood'} is required`);
    }
    return new Address({ street, number, complement, neighborhood, city, state, zipCode });
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
