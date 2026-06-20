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

export class Address extends ValueObject<AddressProps> {
  private constructor(props: AddressProps) {
    super(props);
  }

  static create(props: AddressProps, spec: AddressSpec): Address {
    if (spec.postalRegex !== null && !spec.postalRegex.test(props.zipCode)) {
      throw new Error(`Invalid ${spec.postalLabel}: ${props.zipCode}`);
    }
    if (spec.statePattern !== null && !spec.statePattern.test(props.state)) {
      throw new Error(`Invalid ${spec.stateLabel}: ${props.state}`);
    }
    if (spec.requireNeighborhood && !props.neighborhood) {
      throw new Error(`${spec.neighborhoodLabel ?? 'neighborhood'} is required`);
    }
    return new Address({ ...props });
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
