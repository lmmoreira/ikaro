// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Address } from '@ikaro/types';
import type { AddressLookup } from '@/lib/address/address-lookup.port';
import { InMemoryAddressLookup } from '@/lib/address/in-memory-address-lookup';
import { AddressFields } from './AddressFields';

function emptyAddress(): Address {
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

function Wrapper({ addressLookup }: { readonly addressLookup?: AddressLookup }) {
  const [value, setValue] = useState<Address>(emptyAddress());
  return (
    <AddressFields
      value={value}
      onChange={setValue}
      idPrefix="contact"
      addressLookup={addressLookup}
    />
  );
}

describe('AddressFields', () => {
  it('renders all address fields', () => {
    render(<Wrapper />);

    expect(screen.getByLabelText('CEP')).toBeInTheDocument();
    expect(screen.getByLabelText('Rua')).toBeInTheDocument();
    expect(screen.getByLabelText('Número')).toBeInTheDocument();
    expect(screen.getByLabelText('Complemento')).toBeInTheDocument();
    expect(screen.getByLabelText('Bairro')).toBeInTheDocument();
    expect(screen.getByLabelText('Cidade')).toBeInTheDocument();
    expect(screen.getByLabelText('UF')).toBeInTheDocument();
  });

  it('autofills street, neighborhood, city and state when the CEP resolves', async () => {
    const user = userEvent.setup();
    const lookup = new InMemoryAddressLookup({
      '01310100': {
        street: 'Avenida Paulista',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
      },
    });
    render(<Wrapper addressLookup={lookup} />);

    await user.type(screen.getByLabelText('CEP'), '01310100');

    expect(await screen.findByDisplayValue('Avenida Paulista')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Bela Vista')).toBeInTheDocument();
    expect(screen.getByDisplayValue('São Paulo')).toBeInTheDocument();
    expect(screen.getByDisplayValue('SP')).toBeInTheDocument();
  });

  it('shows a not-found message and leaves fields editable when the CEP does not resolve', async () => {
    const user = userEvent.setup();
    render(<Wrapper addressLookup={new InMemoryAddressLookup({})} />);

    await user.type(screen.getByLabelText('CEP'), '00000000');

    expect(await screen.findByTestId('contact-lookup-failed')).toBeInTheDocument();
    expect(screen.getByLabelText('Rua')).not.toBeDisabled();
  });

  it('allows manual editing of the street field', async () => {
    const user = userEvent.setup();
    render(<Wrapper addressLookup={new InMemoryAddressLookup({})} />);

    await user.type(screen.getByLabelText('Rua'), 'Rua Manual');

    expect(screen.getByDisplayValue('Rua Manual')).toBeInTheDocument();
  });
});
