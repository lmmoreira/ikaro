import { ValueObject } from '../domain/value-object';

interface AddressProps {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export class Address extends ValueObject<AddressProps> {
  private constructor(props: AddressProps) {
    super(props);
  }

  static create(props: AddressProps): Address {
    const zip = props.zipCode.replace(/\D/g, '');
    if (zip.length !== 8) throw new Error(`Invalid CEP: ${props.zipCode}`);
    return new Address({ ...props, zipCode: zip });
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
  get neighborhood(): string {
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
    parts.push(this.props.neighborhood);
    parts.push(`${this.props.city} - ${this.props.state}`);
    parts.push(this.props.zipCode.replace(/(\d{5})(\d{3})/, '$1-$2'));
    return parts.join(', ');
  }
}
