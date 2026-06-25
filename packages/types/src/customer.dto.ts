import type { Address } from './address';

export interface CustomerSearchItem {
  readonly customerId: string;
  readonly name: string;
  readonly email: string;
  readonly currentPoints: number;
}

export interface CustomerSearchListResponse {
  readonly items: CustomerSearchItem[];
  readonly total: number;
}

export interface CustomerProfileResponse {
  customerId: string;
  email: string;
  name: string;
  phone: string | null;
  defaultAddress: Address | null;
}
