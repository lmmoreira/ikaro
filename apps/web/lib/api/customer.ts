import { bffClient } from './bff-client';

export interface CustomerAddressResponse {
  readonly street: string;
  readonly number: string;
  readonly complement?: string | null;
  readonly neighborhood: string;
  readonly city: string;
  readonly state: string;
  readonly zipCode: string;
}

export interface CustomerProfileResponse {
  readonly customerId: string;
  readonly email: string;
  readonly name: string;
  readonly phone: string | null;
  readonly defaultAddress: CustomerAddressResponse | null;
}

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
