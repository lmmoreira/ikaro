// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { hotsiteServiceBookingDefaults, makeHotsiteService, renderWithIntl } from '@/test-utils';
import { ServiceCard } from './ServiceCard';

describe('ServiceCard', () => {
  it('shows a fixed service with its price and duration and a data-service-id', () => {
    const service = makeHotsiteService({ description: 'Lavagem completa' });
    renderWithIntl(
      <ServiceCard service={service} isSelected={false} isUnavailable={false} onToggle={vi.fn()} />,
    );

    expect(screen.getByTestId('service-card')).toHaveAttribute('data-service-id', service.id);
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
    expect(screen.getByText('1h')).toBeInTheDocument();
    expect(screen.getByText('Lavagem completa')).toBeInTheDocument();
  });

  it('toggles on click', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithIntl(
      <ServiceCard
        service={makeHotsiteService()}
        isSelected={false}
        isUnavailable={false}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByRole('checkbox'));

    expect(onToggle).toHaveBeenCalled();
  });

  it('falls back to the fixed price when a per-time service has no increment amount', () => {
    const service = makeHotsiteService({
      bookingPolicy: {
        ...hotsiteServiceBookingDefaults.bookingPolicy,
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricePerIncrementAmount: null,
      },
    });
    renderWithIntl(
      <ServiceCard service={service} isSelected={false} isUnavailable={false} onToggle={vi.fn()} />,
    );

    expect(screen.getByText('R$ 150,00')).toBeInTheDocument();
    expect(screen.queryByTestId('service-rate')).not.toBeInTheDocument();
  });

  it('omits the duration range when the policy has no bounds', () => {
    const service = makeHotsiteService({
      bookingPolicy: {
        ...hotsiteServiceBookingDefaults.bookingPolicy,
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricePerIncrementAmount: 50,
        pricingIncrementMinutes: 60,
      },
    });
    renderWithIntl(
      <ServiceCard service={service} isSelected={false} isUnavailable={false} onToggle={vi.fn()} />,
    );

    expect(screen.getByTestId('service-rate')).toHaveTextContent('R$ 50,00 / hora');
    expect(screen.queryByTestId('service-duration-range')).not.toBeInTheDocument();
  });

  it('shows the unavailable message naming the service', () => {
    renderWithIntl(
      <ServiceCard
        service={makeHotsiteService({ name: 'Massagem Relaxante' })}
        isSelected
        isUnavailable
        onToggle={vi.fn()}
      />,
    );

    const alert = screen.getByTestId('service-unavailable');
    expect(alert).toHaveTextContent('Este serviço não está disponível para reserva no momento.');
    expect(alert).toHaveTextContent('Massagem Relaxante — escolha outro serviço para continuar.');
  });
});
