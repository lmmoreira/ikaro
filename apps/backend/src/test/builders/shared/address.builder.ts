import { countrySpec } from '@ikaro/i18n';
import { Address } from '../../../shared/value-objects/address';

/** A valid Brazilian address (`Address.create` against the BR spec); a spec overrides only what it varies. */
export class AddressBuilder {
  private street = 'Rua das Flores';
  private number = '100';
  private neighborhood = 'Centro';
  private city = 'Belo Horizonte';
  private state = 'MG';
  private zipCode = '30130-110';

  withStreet(street: string): this {
    this.street = street;
    return this;
  }

  withCity(city: string): this {
    this.city = city;
    return this;
  }

  withState(state: string): this {
    this.state = state;
    return this;
  }

  withZipCode(zipCode: string): this {
    this.zipCode = zipCode;
    return this;
  }

  build(): Address {
    return Address.create(
      {
        street: this.street,
        number: this.number,
        neighborhood: this.neighborhood,
        city: this.city,
        state: this.state,
        zipCode: this.zipCode,
      },
      countrySpec('BR').address,
    );
  }
}
