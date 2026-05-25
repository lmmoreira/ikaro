export interface AddressResponse {
  street: string;
  number: string;
  complement?: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface CustomerProfileResponse {
  customerId: string;
  email: string;
  name: string;
  phone: string | null;
  defaultAddress: AddressResponse | null;
}
