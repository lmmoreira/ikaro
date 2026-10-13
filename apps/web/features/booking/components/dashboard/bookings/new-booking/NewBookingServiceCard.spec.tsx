// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeHotsiteService, renderWithIntl } from '@/test-utils';
import { NewBookingServiceCard } from './NewBookingServiceCard';

const FIXED = makeHotsiteService({ id: 'svc-1', name: 'Lavagem Simples', description: 'Externa' });

describe('NewBookingServiceCard', () => {
  it('shows the name, description, fixed price and duration', () => {
    renderWithIntl(
      <NewBookingServiceCard
        service={FIXED}
        isSelected={false}
        isUnavailable={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText('Externa')).toBeInTheDocument();
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
  });

  it('shows a per-time service as its rate and range, not a fixed price', () => {
    const perTime = makeHotsiteService({
      id: 'svc-2',
      bookingPolicy: {
        ...FIXED.bookingPolicy,
        durationPolicy: 'CUSTOMER_SELECTED',
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 60,
        pricePerIncrementAmount: 50,
        durationMinMinutes: 60,
        durationMaxMinutes: 180,
        durationIncrementMinutes: 30,
      },
    });
    renderWithIntl(
      <NewBookingServiceCard
        service={perTime}
        isSelected={false}
        isUnavailable={false}
        onToggle={vi.fn()}
      />,
    );

    expect(screen.getByTestId('service-rate')).toHaveTextContent('R$ 50,00 / hora');
    expect(screen.getByTestId('service-duration-range')).toHaveTextContent('1h a 3h');
    expect(screen.queryByText('R$ 150,00')).not.toBeInTheDocument();
  });

  it('toggles on click and marks pickup services', async () => {
    const onToggle = vi.fn();
    const pickup = makeHotsiteService({ id: 'svc-3', requiresPickupAddress: true });
    renderWithIntl(
      <NewBookingServiceCard
        service={pickup}
        isSelected
        isUnavailable={false}
        onToggle={onToggle}
      />,
    );

    await userEvent.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalledOnce();
    expect(screen.getByTestId('service-card')).toHaveAttribute('data-requires-pickup', 'true');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('explains why a service with nobody to pick cannot be booked', () => {
    renderWithIntl(
      <NewBookingServiceCard service={FIXED} isSelected={false} isUnavailable onToggle={vi.fn()} />,
    );

    expect(screen.getByTestId('service-unavailable')).toHaveTextContent('Lavagem Simples');
  });
});
