// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceBookingPolicyItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { PolicyDurationPricingCard } from './PolicyDurationPricingCard';

const BASE_POLICY: ServiceBookingPolicyItem = {
  defaultApprovalMode: null,
  manualHoldMinutes: null,
  cancellationWindowHoursOverride: null,
  rescheduleWindowHoursOverride: null,
  minBookingAdvanceHoursOverride: null,
  maxBookingAdvanceDaysOverride: null,
  recurrenceEligible: false,
  availabilityAlertEligible: false,
  durationPolicy: 'FIXED',
  durationMinMinutes: null,
  durationMaxMinutes: null,
  durationIncrementMinutes: null,
  pricingPolicy: 'FIXED',
  pricingIncrementMinutes: null,
  pricePerIncrementAmount: null,
  minimumChargeAmount: null,
};

describe('PolicyDurationPricingCard', () => {
  it('hides duration/pricing detail fields when policy is FIXED', () => {
    renderWithIntl(<PolicyDurationPricingCard policy={BASE_POLICY} onPatch={vi.fn()} />);

    expect(screen.queryByTestId('policy-duration-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('policy-pricing-detail')).not.toBeInTheDocument();
    expect(screen.getByTestId('policy-pricing-policy')).toBeDisabled();
  });

  it('calls onPatch with the new durationPolicy when changed', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithIntl(<PolicyDurationPricingCard policy={BASE_POLICY} onPatch={onPatch} />);

    await user.selectOptions(screen.getByTestId('policy-duration-policy'), 'CUSTOMER_SELECTED');
    expect(onPatch).toHaveBeenCalledWith({ durationPolicy: 'CUSTOMER_SELECTED' });
  });

  it('shows duration and pricing detail fields for a variable-duration, per-increment policy', () => {
    renderWithIntl(
      <PolicyDurationPricingCard
        policy={{
          ...BASE_POLICY,
          durationPolicy: 'CUSTOMER_SELECTED',
          pricingPolicy: 'PER_TIME_INCREMENT',
        }}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.getByTestId('policy-duration-detail')).toBeInTheDocument();
    expect(screen.getByTestId('policy-pricing-detail')).toBeInTheDocument();
    expect(screen.getByTestId('policy-pricing-policy')).toBeEnabled();
  });

  it('forces pricingPolicy back to FIXED when switching duration back to FIXED, so a prior per-increment policy stays valid to save', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithIntl(
      <PolicyDurationPricingCard
        policy={{
          ...BASE_POLICY,
          durationPolicy: 'CUSTOMER_SELECTED',
          pricingPolicy: 'PER_TIME_INCREMENT',
        }}
        onPatch={onPatch}
      />,
    );

    // Without this, the backend rejects pricingPolicy=PER_TIME_INCREMENT with
    // durationPolicy=FIXED (validateBookingPolicyCompleteness's
    // per-time-increment-requires-custom-duration check).
    await user.selectOptions(screen.getByTestId('policy-duration-policy'), 'FIXED');
    expect(onPatch).toHaveBeenCalledWith({ durationPolicy: 'FIXED', pricingPolicy: 'FIXED' });
  });

  it('states the unit (minutes / R$) on every duration and pricing field', () => {
    renderWithIntl(
      <PolicyDurationPricingCard
        policy={{
          ...BASE_POLICY,
          durationPolicy: 'CUSTOMER_SELECTED',
          pricingPolicy: 'PER_TIME_INCREMENT',
        }}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Duração mínima (minutos)')).toBeInTheDocument();
    expect(screen.getByLabelText('Duração máxima (minutos)')).toBeInTheDocument();
    expect(screen.getByLabelText('Intervalo de escolha (minutos)')).toBeInTheDocument();
    expect(screen.getByLabelText('Incremento de cobrança (minutos)')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor por incremento (R$)')).toBeInTheDocument();
    expect(screen.getByLabelText('Cobrança mínima (R$, opcional)')).toBeInTheDocument();
  });

  it('explains what each policy does, including how the total is computed', () => {
    renderWithIntl(
      <PolicyDurationPricingCard
        policy={{
          ...BASE_POLICY,
          durationPolicy: 'CUSTOMER_SELECTED',
          pricingPolicy: 'PER_TIME_INCREMENT',
        }}
        onPatch={vi.fn()}
      />,
    );

    expect(screen.getByText(/Fixa: usa a duração \(em minutos\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/Total = valor por incremento × número de incrementos/),
    ).toBeInTheDocument();
  });
});
