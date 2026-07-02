import { digitsOnly } from '@/shared/utils/digits-only';
import type { AddressLookup, AddressLookupResult } from './address-lookup.port';

interface ViaCepResponse {
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

export const viaCepAddressLookup: AddressLookup = {
  async lookup(cep: string): Promise<AddressLookupResult | null> {
    const digits = digitsOnly(cep);
    if (digits.length !== 8) return null;

    let res: Response;
    try {
      res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    } catch {
      return null;
    }

    if (!res.ok) return null;

    const data = (await res.json()) as ViaCepResponse;
    if (data.erro || !data.logradouro) return null;

    return {
      street: data.logradouro,
      neighborhood: data.bairro ?? '',
      city: data.localidade ?? '',
      state: data.uf ?? '',
    };
  },
};
