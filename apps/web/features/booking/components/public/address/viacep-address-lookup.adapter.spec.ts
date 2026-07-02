import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { viaCepAddressLookup } from './viacep-address-lookup.adapter';

describe('viaCepAddressLookup', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the mapped address for a valid CEP', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          logradouro: 'Avenida Paulista',
          bairro: 'Bela Vista',
          localidade: 'São Paulo',
          uf: 'SP',
        }),
        { status: 200 },
      ),
    );

    const result = await viaCepAddressLookup.lookup('01310-100');

    expect(result).toEqual({
      street: 'Avenida Paulista',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    });
    expect(fetchSpy).toHaveBeenCalledWith('https://viacep.com.br/ws/01310100/json/');
  });

  it('returns null when the CEP does not exist', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ erro: true }), { status: 200 }));

    const result = await viaCepAddressLookup.lookup('00000000');

    expect(result).toBeNull();
  });

  it('returns null when the CEP has an invalid length', async () => {
    const result = await viaCepAddressLookup.lookup('123');

    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when the BFF/ViaCEP request fails', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    const result = await viaCepAddressLookup.lookup('01310-100');

    expect(result).toBeNull();
  });

  it('returns null when the network request throws', async () => {
    fetchSpy.mockRejectedValue(new Error('network error'));

    const result = await viaCepAddressLookup.lookup('01310-100');

    expect(result).toBeNull();
  });
});
