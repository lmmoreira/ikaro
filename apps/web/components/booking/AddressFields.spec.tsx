// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Address, HotsiteAddressSpec } from '@ikaro/types';
import type { AddressLookup } from '@/lib/address/address-lookup.port';
import { InMemoryAddressLookup } from '@/lib/address/in-memory-address-lookup';
import { AddressFields } from './AddressFields';

const BR_SPEC: HotsiteAddressSpec = {
  postalLabel: 'CEP',
  postalPlaceholder: '00000-000',
  stateLabel: 'UF',
  requireNeighborhood: true,
  neighborhoodLabel: 'Bairro',
  lookupService: 'viacep',
};

const US_SPEC: HotsiteAddressSpec = {
  postalLabel: 'ZIP Code',
  postalPlaceholder: '90210',
  stateLabel: 'State',
  requireNeighborhood: false,
  neighborhoodLabel: null,
  lookupService: 'none',
};

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

function Wrapper({
  addressLookup,
  addressSpec = BR_SPEC,
}: {
  readonly addressLookup?: AddressLookup;
  readonly addressSpec?: HotsiteAddressSpec;
}) {
  const [value, setValue] = useState<Address>(emptyAddress());
  return (
    <AddressFields
      value={value}
      onChange={setValue}
      idPrefix="contact"
      addressSpec={addressSpec}
      addressLookup={addressLookup}
    />
  );
}

describe('AddressFields', () => {
  it('renders all address fields for a BR tenant', () => {
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

    expect(await screen.findByTestId('lookup-failed')).toBeInTheDocument();
    expect(screen.getByLabelText('Rua')).not.toBeDisabled();
  });

  it('allows manual editing of the street field', async () => {
    const user = userEvent.setup();
    render(<Wrapper addressLookup={new InMemoryAddressLookup({})} />);

    await user.type(screen.getByLabelText('Rua'), 'Rua Manual');

    expect(screen.getByDisplayValue('Rua Manual')).toBeInTheDocument();
  });

  it('renders US labels, no neighborhood field, and does not trigger a lookup', async () => {
    const user = userEvent.setup();
    const lookup = new InMemoryAddressLookup({});
    render(<Wrapper addressSpec={US_SPEC} addressLookup={lookup} />);

    expect(screen.getByLabelText('ZIP Code')).toBeInTheDocument();
    expect(screen.getByLabelText('State')).toBeInTheDocument();
    expect(screen.queryByLabelText('Bairro')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Neighborhood')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('ZIP Code'), '12345678');

    expect(screen.queryByTestId('lookup-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lookup-failed')).not.toBeInTheDocument();
    expect(lookup.calls).toHaveLength(0);
  });
});
