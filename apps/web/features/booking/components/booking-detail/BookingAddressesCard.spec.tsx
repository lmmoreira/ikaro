// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Address } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingAddressesCard } from './BookingAddressesCard';

const pickup: Address = {
  street: 'Rua das Flores',
  number: '120',
  neighborhood: 'Pinheiros',
  city: 'São Paulo',
  state: 'SP',
  zipCode: '05422-000',
};
const contact: Address = {
  street: 'Av. Paulista',
  number: '1000',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  zipCode: '01310-100',
};

describe('BookingAddressesCard', () => {
  it('renders nothing when the booking has no address', () => {
    renderWithIntl(<BookingAddressesCard pickupAddress={null} contactAddress={null} />);

    expect(screen.queryByTestId('booking-addresses-card')).not.toBeInTheDocument();
  });

  it('shows the pickup and the contact address for staff', () => {
    renderWithIntl(<BookingAddressesCard pickupAddress={pickup} contactAddress={contact} />);

    expect(screen.getByText('Endereço de retirada')).toBeInTheDocument();
    expect(screen.getByText(/Rua das Flores, 120/)).toBeInTheDocument();
    expect(screen.getByText('Endereço do contato')).toBeInTheDocument();
    expect(screen.getByText(/Av. Paulista, 1000/)).toBeInTheDocument();
  });

  it('shows only the pickup address when no contact address is passed (customer)', () => {
    renderWithIntl(<BookingAddressesCard pickupAddress={pickup} />);

    expect(screen.getByText(/Rua das Flores, 120/)).toBeInTheDocument();
    expect(screen.queryByText('Endereço do contato')).not.toBeInTheDocument();
  });
});
