import { countrySpec } from '@ikaro/i18n';
import { Address, AddressProps } from '../../shared/value-objects/address';

const DEFAULT_ADDRESS: AddressProps = {
  street: 'Rua das Flores',
  number: '100',
  neighborhood: 'Centro',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30100000',
};

/** Returns a valid Address VO for use in tests. Defaults to a Brazilian address. */
export function testAddress(overrides: Partial<AddressProps> = {}, countryCode = 'BR'): Address {
  return Address.create({ ...DEFAULT_ADDRESS, ...overrides }, countrySpec(countryCode).address);
}

/** Returns raw AddressProps (plain object) for use in DTO / controller tests. */
export function testAddressProps(overrides: Partial<AddressProps> = {}): AddressProps {
  return { ...DEFAULT_ADDRESS, ...overrides };
}
