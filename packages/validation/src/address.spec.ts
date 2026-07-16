import { AddressErrorCode } from '@ikaro/types';
import { AddressSchema, AddressShapeSchema, PartialAddressSchema } from './address';

const VALID_ADDRESS = {
  street: 'Rua A',
  number: '10',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30000-000',
};

describe('AddressShapeSchema', () => {
  it('accepts a fully populated address', () => {
    expect(AddressShapeSchema.safeParse(VALID_ADDRESS).success).toBe(true);
  });

  it('accepts an empty street — required-ness is deferred to the backend Address VO', () => {
    const result = AddressShapeSchema.safeParse({ ...VALID_ADDRESS, street: '' });
    expect(result.success).toBe(true);
  });

  it('rejects a state longer than 10 chars', () => {
    const result = AddressShapeSchema.safeParse({ ...VALID_ADDRESS, state: 'A'.repeat(11) });
    expect(result.success).toBe(false);
  });

  it('rejects a zipCode longer than 20 chars', () => {
    const result = AddressShapeSchema.safeParse({ ...VALID_ADDRESS, zipCode: '0'.repeat(21) });
    expect(result.success).toBe(false);
  });
});

describe('AddressSchema', () => {
  it('accepts a fully populated address', () => {
    expect(AddressSchema.safeParse(VALID_ADDRESS).success).toBe(true);
  });

  it('rejects an empty zipCode with AddressErrorCode.FIELD_REQUIRED', () => {
    const result = AddressSchema.safeParse({ ...VALID_ADDRESS, zipCode: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'zipCode');
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe(AddressErrorCode.FIELD_REQUIRED);
    }
  });

  it('rejects an empty street with AddressErrorCode.FIELD_REQUIRED', () => {
    const result = AddressSchema.safeParse({ ...VALID_ADDRESS, street: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'street');
      const params = issue as unknown as { params?: { code?: string } };
      expect(params.params?.code).toBe(AddressErrorCode.FIELD_REQUIRED);
    }
  });
});

describe('PartialAddressSchema', () => {
  it('accepts an empty object — every field is optional', () => {
    expect(PartialAddressSchema.safeParse({}).success).toBe(true);
  });

  it('accepts explicit nulls for street/number/neighborhood/city', () => {
    const result = PartialAddressSchema.safeParse({
      street: null,
      number: null,
      neighborhood: null,
      city: null,
      state: null,
      zipCode: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a state that is present but empty (min(1) applies once non-null)', () => {
    const result = PartialAddressSchema.safeParse({ state: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a zipCode longer than 20 chars', () => {
    const result = PartialAddressSchema.safeParse({ zipCode: '0'.repeat(21) });
    expect(result.success).toBe(false);
  });

  it('does not reject an empty street the way it rejects an empty state — no min(1) on street', () => {
    const result = PartialAddressSchema.safeParse({ street: '' });
    expect(result.success).toBe(true);
  });
});
