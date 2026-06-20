import { describe, expect, it } from 'vitest';
import { emptyAddress, emptyPersonalInfo, isAddressFilled } from './personal-info';

describe('emptyAddress', () => {
  it('returns an address with all fields empty', () => {
    expect(emptyAddress()).toEqual({
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      zipCode: '',
    });
  });
});

describe('emptyPersonalInfo', () => {
  it('returns blank contact fields, empty addresses and no photos', () => {
    const value = emptyPersonalInfo();

    expect(value.contactName).toBe('');
    expect(value.contactEmail).toBe('');
    expect(value.contactPhone).toBe('');
    expect(value.contactAddress).toEqual(emptyAddress());
    expect(value.pickupAddress).toEqual(emptyAddress());
    expect(value.photoFilePaths).toEqual([]);
  });
});

describe('isAddressFilled', () => {
  it('returns false when any required field is empty (BR, neighborhood required)', () => {
    expect(isAddressFilled(emptyAddress(), true)).toBe(false);
  });

  it('returns true when all required fields are filled (BR, neighborhood required)', () => {
    expect(
      isAddressFilled(
        {
          street: 'Avenida Paulista',
          number: '1000',
          complement: '',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310100',
        },
        true,
      ),
    ).toBe(true);
  });

  it('treats an empty complement as filled (complement is optional)', () => {
    expect(
      isAddressFilled(
        {
          street: 'Avenida Paulista',
          number: '1000',
          neighborhood: 'Bela Vista',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310100',
        },
        true,
      ),
    ).toBe(true);
  });

  it('returns false when neighborhood is required but missing', () => {
    expect(
      isAddressFilled(
        {
          street: 'Avenida Paulista',
          number: '1000',
          neighborhood: '',
          city: 'São Paulo',
          state: 'SP',
          zipCode: '01310100',
        },
        true,
      ),
    ).toBe(false);
  });

  it('returns true without a neighborhood when the country does not require it', () => {
    expect(
      isAddressFilled(
        {
          street: 'Main St',
          number: '1',
          neighborhood: '',
          city: 'Beverly Hills',
          state: 'CA',
          zipCode: '90210',
        },
        false,
      ),
    ).toBe(true);
  });
});
