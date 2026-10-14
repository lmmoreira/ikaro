import { describe, expect, it } from 'vitest';
import { findContactError } from './contact-validation';

const VALID = {
  contactName: 'Maria',
  contactEmail: 'maria@example.com',
  contactPhone: '+5531999990000',
};

describe('findContactError', () => {
  it('is null for a complete contact', () => {
    expect(findContactError(VALID)).toBeNull();
  });

  it.each([
    ['name', { ...VALID, contactName: '   ' }],
    ['email', { ...VALID, contactEmail: 'not-an-email' }],
    ['phone', { ...VALID, contactPhone: '' }],
  ])('names the %s field when it is missing or malformed', (field, value) => {
    expect(findContactError(value)).toBe(field);
  });

  it('reports the first problem in name, e-mail, phone order', () => {
    expect(findContactError({ contactName: '', contactEmail: '', contactPhone: '' })).toBe('name');
  });
});
