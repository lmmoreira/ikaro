import { bffClient } from '@/shared/lib/api/bff-client';
import type { Address, CustomerProfileResponse } from '@ikaro/types';

export type CustomerAddressResponse = Address;

export interface UpdateCustomerProfileRequest {
  readonly name?: string;
  readonly phone?: string | null;
  readonly defaultAddress?: CustomerAddressResponse | null;
}

export async function getCustomerProfile(): Promise<CustomerProfileResponse> {
  const res = await bffClient.get<CustomerProfileResponse>('/customers/me');
  return res.data;
}

export async function updateCustomerProfile(
  body: UpdateCustomerProfileRequest,
): Promise<CustomerProfileResponse> {
  const res = await bffClient.patch<CustomerProfileResponse>('/customers/me', body);
  return res.data;
}
