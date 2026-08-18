// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { MarkCompleteLineFields } from './MarkCompleteLineFields';

const LINES: StaffBookingDetailResponse['lines'] = [
  {
    lineId: 'l-1',
    serviceId: 'svc-1',
    serviceName: 'Lavagem Simples',
    priceAtBooking: { amount: 60, currency: 'BRL' },
    durationMinsAtBooking: 30,
    pointsValueAtBooking: 5,
    requiresPickupAddressAtBooking: false,
    actualPriceCharged: null,
  },
  {
    lineId: 'l-2',
    serviceId: 'svc-2',
    serviceName: 'Cera',
    priceAtBooking: { amount: 40, currency: 'BRL' },
    durationMinsAtBooking: 20,
    pointsValueAtBooking: 3,
    requiresPickupAddressAtBooking: false,
    actualPriceCharged: null,
  },
];

describe('MarkCompleteLineFields', () => {
  it('renders one price field per line, seeded with its quoted price', () => {
    renderWithIntl(
      <MarkCompleteLineFields
        lines={LINES}
        linePrices={{ 'l-1': '60', 'l-2': '40' }}
        onLinePriceChange={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId('complete-line-name')).toHaveLength(2);
    expect(screen.getAllByRole('spinbutton', { name: 'Cobrado' })[0]).toHaveValue(60);
    expect(screen.getAllByRole('spinbutton', { name: 'Cobrado' })[1]).toHaveValue(40);
  });

  it('calls onLinePriceChange with the edited line id and value', () => {
    const onLinePriceChange = vi.fn();
    renderWithIntl(
      <MarkCompleteLineFields
        lines={LINES}
        linePrices={{ 'l-1': '60', 'l-2': '40' }}
        onLinePriceChange={onLinePriceChange}
      />,
    );

    const inputs = screen.getAllByRole('spinbutton', { name: 'Cobrado' });
    fireEvent.change(inputs[0], { target: { value: '75' } });

    expect(onLinePriceChange).toHaveBeenCalledWith('l-1', '75');
  });
});
