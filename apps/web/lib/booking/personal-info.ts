import type { Address } from '@ikaro/types';

export interface PersonalInfoValue {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: Address;
  pickupAddress: Address;
  photoFilePaths: string[];
}

export function emptyAddress(): Address {
  return {
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zipCode: '',
  };
}

export function emptyPersonalInfo(): PersonalInfoValue {
  return {
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    contactAddress: emptyAddress(),
    pickupAddress: emptyAddress(),
    photoFilePaths: [],
  };
}

export function isAddressFilled(address: Address, requireNeighborhood: boolean): boolean {
  return (
    address.street !== '' &&
    address.number !== '' &&
    (!requireNeighborhood || !!address.neighborhood) &&
    address.city !== '' &&
    address.state !== '' &&
    address.zipCode !== ''
  );
}

/** Drops a blank neighborhood instead of sending it as an empty string — the backend's
 * Zod schema accepts an omitted neighborhood but rejects an empty one (`.min(1)`). */
export function sanitizeAddress(address: Address): Address {
  return { ...address, neighborhood: address.neighborhood || undefined };
}
