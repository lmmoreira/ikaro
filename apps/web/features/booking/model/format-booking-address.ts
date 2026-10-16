import type { Address } from '@ikaro/types';

// "Rua das Flores, 120 apto 4 — Pinheiros, São Paulo/SP, 05422-000": the street line, then the
// neighbourhood when there is one, then city/state and the postal code. Display only.
export function formatBookingAddress(address: Address): string {
  const complement = address.complement ? ` ${address.complement}` : '';
  const street = `${address.street}, ${address.number}${complement}`;
  const place = address.neighborhood ? `${street} — ${address.neighborhood}` : street;
  return `${place}, ${address.city}/${address.state}, ${address.zipCode}`;
}
