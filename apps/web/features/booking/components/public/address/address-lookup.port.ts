export interface AddressLookupResult {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface AddressLookup {
  lookup(cep: string): Promise<AddressLookupResult | null>;
}
