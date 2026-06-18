import { Address } from './address';

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
    it('normalises zipCode to digits only', () => {
      const address = Address.create(baseProps);
      expect(address.zipCode).toBe('01310100');
    });

    it('throws on an invalid CEP', () => {
      expect(() => Address.create({ ...baseProps, zipCode: '123' })).toThrow('Invalid CEP');
    });
  });

  describe('format', () => {
    it('formats without a complement', () => {
      const address = Address.create(baseProps);
      expect(address.format()).toBe('Rua das Flores, 123, Centro, São Paulo - SP, 01310-100');
    });

    it('includes the complement right after street/number when present', () => {
      const address = Address.create({ ...baseProps, complement: 'Apto 45' });
      expect(address.format()).toBe(
        'Rua das Flores, 123, Apto 45, Centro, São Paulo - SP, 01310-100',
      );
    });
  });
});
