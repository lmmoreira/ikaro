// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ServicePriceDurationFields } from './ServicePriceDurationFields';

describe('ServicePriceDurationFields', () => {
  it('shows the price edit-warning hint when there is no price error', () => {
    renderWithIntl(
      <ServicePriceDurationFields
        priceAmount="10"
        durationMinutes="30"
        priceError={undefined}
        durationError={undefined}
        onPriceAmountChange={vi.fn()}
        onDurationMinutesChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('service-price-input')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByTestId('service-price-error')).not.toBeInTheDocument();
  });

  it('shows the price error instead of the warning hint when priceError is set', () => {
    renderWithIntl(
      <ServicePriceDurationFields
        priceAmount="-1"
        durationMinutes="30"
        priceError="Preço inválido"
        durationError={undefined}
        onPriceAmountChange={vi.fn()}
        onDurationMinutesChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('service-price-error')).toHaveTextContent('Preço inválido');
    expect(screen.getByTestId('service-price-input')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the duration error only when durationError is set', () => {
    renderWithIntl(
      <ServicePriceDurationFields
        priceAmount="10"
        durationMinutes="0"
        priceError={undefined}
        durationError="Duração inválida"
        onPriceAmountChange={vi.fn()}
        onDurationMinutesChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('service-duration-error')).toHaveTextContent('Duração inválida');
    expect(screen.getByTestId('service-duration-input')).toHaveAttribute('aria-invalid', 'true');
  });

  it('calls onPriceAmountChange and onDurationMinutesChange when each input changes', async () => {
    const user = userEvent.setup();
    const onPriceAmountChange = vi.fn();
    const onDurationMinutesChange = vi.fn();
    renderWithIntl(
      <ServicePriceDurationFields
        priceAmount=""
        durationMinutes=""
        priceError={undefined}
        durationError={undefined}
        onPriceAmountChange={onPriceAmountChange}
        onDurationMinutesChange={onDurationMinutesChange}
      />,
    );

    await user.type(screen.getByTestId('service-price-input'), '5');
    expect(onPriceAmountChange).toHaveBeenCalledWith('5');

    await user.type(screen.getByTestId('service-duration-input'), '3');
    expect(onDurationMinutesChange).toHaveBeenCalledWith('3');
  });
});
