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

export function isAddressFilled(address: Address): boolean {
  return (
    address.street !== '' &&
    address.number !== '' &&
    address.neighborhood !== '' &&
    address.city !== '' &&
    address.state !== '' &&
    address.zipCode !== ''
  );
}
