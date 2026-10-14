// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BR_ADDRESS_SPEC, renderWithIntl } from '@/test-utils';
import { emptyAddress } from '@/features/booking/model/personal-info';
import { NewBookingAddressFields } from './NewBookingAddressFields';

describe('NewBookingAddressFields', () => {
  it('labels the fields with the tenant’s address format', () => {
    renderWithIntl(
      <NewBookingAddressFields
        value={emptyAddress()}
        onChange={vi.fn()}
        addressSpec={BR_ADDRESS_SPEC}
      />,
    );

    for (const label of ['CEP', 'Rua', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('leaves the neighbourhood out where the country does not use one', () => {
    renderWithIntl(
      <NewBookingAddressFields
        value={emptyAddress()}
        onChange={vi.fn()}
        addressSpec={{ ...BR_ADDRESS_SPEC, requireNeighborhood: false }}
      />,
    );

    expect(screen.queryByLabelText('Bairro')).not.toBeInTheDocument();
  });

  it('reports an edit with the other fields kept', () => {
    const onChange = vi.fn();
    const value = { ...emptyAddress(), city: 'BH' };
    renderWithIntl(
      <NewBookingAddressFields value={value} onChange={onChange} addressSpec={BR_ADDRESS_SPEC} />,
    );

    fireEvent.change(screen.getByLabelText('Rua'), { target: { value: 'Rua A' } });

    expect(onChange).toHaveBeenCalledWith({ ...value, street: 'Rua A' });
  });

  it('fills street, neighbourhood, city and state from a full postal code', async () => {
    const onChange = vi.fn();
    const addressLookup = {
      lookup: vi.fn().mockResolvedValue({
        street: 'Rua das Flores',
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
      }),
    };
    renderWithIntl(
      <NewBookingAddressFields
        value={emptyAddress()}
        onChange={onChange}
        addressSpec={BR_ADDRESS_SPEC}
        addressLookup={addressLookup}
      />,
    );

    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '30130010' } });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ street: 'Rua das Flores', city: 'Belo Horizonte', state: 'MG' }),
      ),
    );
    expect(addressLookup.lookup).toHaveBeenCalledWith('30130010');
  });

  it('says so when the postal code is not found', async () => {
    const addressLookup = { lookup: vi.fn().mockResolvedValue(null) };
    renderWithIntl(
      <NewBookingAddressFields
        value={emptyAddress()}
        onChange={vi.fn()}
        addressSpec={BR_ADDRESS_SPEC}
        addressLookup={addressLookup}
      />,
    );

    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '30130010' } });

    expect(
      await screen.findByText(/não encontrado|não encontramos|Endereço não/i),
    ).toBeInTheDocument();
  });

  it('flags the required fields when told the form has an error', () => {
    renderWithIntl(
      <NewBookingAddressFields
        value={emptyAddress()}
        onChange={vi.fn()}
        addressSpec={BR_ADDRESS_SPEC}
        hasError
      />,
    );

    expect(screen.getByLabelText('Rua')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Complemento')).not.toHaveAttribute('aria-invalid');
  });
});
