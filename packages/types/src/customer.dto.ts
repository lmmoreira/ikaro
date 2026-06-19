import type { Address } from './address';

export interface CustomerProfileResponse {
  customerId: string;
  email: string;
  name: string;
  phone: string | null;
  defaultAddress: Address | null;
}
