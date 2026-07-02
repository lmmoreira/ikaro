import type { AddressLookup, AddressLookupResult } from './address-lookup.port';

export class InMemoryAddressLookup implements AddressLookup {
  readonly calls: string[] = [];

  constructor(private readonly results: Record<string, AddressLookupResult | null>) {}

  async lookup(cep: string): Promise<AddressLookupResult | null> {
    this.calls.push(cep);
    return this.results[cep] ?? null;
  }
}
