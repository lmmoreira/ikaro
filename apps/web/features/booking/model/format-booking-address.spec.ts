import { describe, expect, it } from 'vitest';
import { formatBookingAddress } from './format-booking-address';

const base = {
  street: 'Rua das Flores',
  number: '120',
  city: 'São Paulo',
  state: 'SP',
  zipCode: '05422-000',
};

describe('formatBookingAddress', () => {
  it('joins the street, neighbourhood, city/state and postal code', () => {
    expect(formatBookingAddress({ ...base, neighborhood: 'Pinheiros' })).toBe(
      'Rua das Flores, 120 — Pinheiros, São Paulo/SP, 05422-000',
    );
  });

  it('includes the complement after the number', () => {
    expect(formatBookingAddress({ ...base, complement: 'apto 4', neighborhood: 'Pinheiros' })).toBe(
      'Rua das Flores, 120 apto 4 — Pinheiros, São Paulo/SP, 05422-000',
    );
  });

  it('leaves out an absent neighbourhood and complement', () => {
    expect(formatBookingAddress({ ...base, complement: null, neighborhood: null })).toBe(
      'Rua das Flores, 120, São Paulo/SP, 05422-000',
    );
  });
});
