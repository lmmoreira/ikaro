import { countrySpec } from '@ikaro/i18n';
import { Address, AddressValidationError } from './address';

const BR = countrySpec('BR').address;
const US = countrySpec('US').address;
const FALLBACK = countrySpec('ZZ').address;

const baseProps = {
  street: 'Rua das Flores',
  number: '123',
  neighborhood: 'Centro',
  city: 'São Paulo',
  state: 'SP',
  zipCode: '01310-100',
};

describe('Address', () => {
  describe('create', () => {
    it('accepts a valid BR address', () => {
      const address = Address.create(baseProps, BR);
      expect(address.zipCode).toBe('01310-100');
    });

    it('throws on an invalid postal code for BR', () => {
      expect(() => Address.create({ ...baseProps, zipCode: '123' }, BR)).toThrow('Invalid CEP');
    });

    it('throws when a required field is blank', () => {
      expect(() => Address.create({ ...baseProps, street: '   ' }, BR)).toThrow('Rua is required');
    });

    it('throws when a required field is null at runtime', () => {
      expect(() => Address.create({ ...baseProps, street: null as unknown as string }, BR)).toThrow(
        'Rua is required',
      );
    });

    it('throws when neighborhood is missing and the country requires it', () => {
      expect(() => Address.create({ ...baseProps, neighborhood: undefined }, BR)).toThrow(
        'Bairro is required',
      );
    });

    it('accepts a valid US address without a neighborhood', () => {
      const address = Address.create(
        {
          street: 'Main St',
          number: '1',
          city: 'Beverly Hills',
          state: 'CA',
          zipCode: '90210',
        },
        US,
      );
      expect(address.zipCode).toBe('90210');
      expect(address.neighborhood).toBeUndefined();
    });

    it('accepts a valid US ZIP+4 address', () => {
      const address = Address.create(
        {
          street: 'Main St',
          number: '1',
          city: 'Beverly Hills',
          state: 'CA',
          zipCode: '90210-1234',
        },
        US,
      );
      expect(address.zipCode).toBe('90210-1234');
    });

    it('throws on an invalid postal code for US', () => {
      expect(() =>
        Address.create(
          { street: 'Main St', number: '1', city: 'Beverly Hills', state: 'CA', zipCode: '123' },
          US,
        ),
      ).toThrow('Invalid ZIP Code');
    });

    it('throws on an invalid state for a country with a state pattern', () => {
      expect(() => Address.create({ ...baseProps, state: 'sao paulo' }, BR)).toThrow('Invalid UF');
    });

    it('throws AddressValidationError (not a plain Error) on validation failure', () => {
      expect(() => Address.create({ ...baseProps, zipCode: '123' }, BR)).toThrow(
        AddressValidationError,
      );
    });

    it('treats a whitespace-only neighborhood as missing when required', () => {
      expect(() => Address.create({ ...baseProps, neighborhood: '   ' }, BR)).toThrow(
        'Bairro is required',
      );
    });

    it('normalizes a blank neighborhood to undefined when not required, not stored as empty string', () => {
      const address = Address.create(
        {
          street: 'Main St',
          number: '1',
          city: 'Beverly Hills',
          state: 'CA',
          zipCode: '90210',
          neighborhood: '   ',
        },
        US,
      );
      expect(address.neighborhood).toBeUndefined();
    });

    it('accepts any postal code and state when the country spec has no constraints', () => {
      const address = Address.create(
        { street: 'Main St', number: '1', city: 'Anytown', state: 'Anyplace', zipCode: 'N/A' },
        FALLBACK,
      );
      expect(address.zipCode).toBe('N/A');
      expect(address.state).toBe('Anyplace');
    });
  });

  describe('format', () => {
    it('formats without a complement', () => {
      const address = Address.create(baseProps, BR);
      expect(address.format()).toBe('Rua das Flores, 123, Centro, São Paulo - SP, 01310-100');
    });

    it('includes the complement right after street/number when present', () => {
      const address = Address.create({ ...baseProps, complement: 'Apto 45' }, BR);
      expect(address.format()).toBe(
        'Rua das Flores, 123, Apto 45, Centro, São Paulo - SP, 01310-100',
      );
    });

    it('omits the neighborhood segment when absent', () => {
      const address = Address.create(
        {
          street: 'Main St',
          number: '1',
          city: 'Beverly Hills',
          state: 'CA',
          zipCode: '90210',
        },
        US,
      );
      expect(address.format()).toBe('Main St, 1, Beverly Hills - CA, 90210');
    });
  });
});
