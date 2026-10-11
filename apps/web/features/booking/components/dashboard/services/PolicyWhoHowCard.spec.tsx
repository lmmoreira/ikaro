// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceBookingPolicyItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { PolicyWhoHowCard } from './PolicyWhoHowCard';

const BASE_POLICY: ServiceBookingPolicyItem = {
  defaultApprovalMode: null,
  manualHoldMinutes: null,
  cancellationWindowHoursOverride: null,
  rescheduleWindowHoursOverride: null,
  minBookingAdvanceHoursOverride: null,
  maxBookingAdvanceDaysOverride: null,
  effectiveMinBookingAdvanceHours: 0,
  effectiveMaxBookingAdvanceDays: 90,
  recurrenceEligible: false,
  recurringHorizonDays: null,
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

describe('PolicyWhoHowCard', () => {
  it('toggles recurrenceEligible and availabilityAlertEligible', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    renderWithIntl(<PolicyWhoHowCard policy={BASE_POLICY} onPatch={onPatch} />);

    await user.click(screen.getByTestId('policy-recurrence-eligible'));
    expect(onPatch).toHaveBeenCalledWith({ recurrenceEligible: true });

    await user.click(screen.getByTestId('policy-availability-alert-eligible'));
    expect(onPatch).toHaveBeenCalledWith({ availabilityAlertEligible: true });
  });

  describe('recurringHorizonDays', () => {
    const RECURRING_POLICY = { ...BASE_POLICY, recurrenceEligible: true };

    it('renders the current value, or blank when null', () => {
      const { rerender } = renderWithIntl(
        <PolicyWhoHowCard
          policy={{ ...RECURRING_POLICY, recurringHorizonDays: 60 }}
          onPatch={vi.fn()}
        />,
      );
      expect(screen.getByTestId('policy-recurring-horizon')).toHaveValue(60);

      rerender(<PolicyWhoHowCard policy={RECURRING_POLICY} onPatch={vi.fn()} />);
      expect(screen.getByTestId('policy-recurring-horizon')).toHaveValue(null);
    });

    it('is disabled while recurrence is off and enabled once it is on', () => {
      const { rerender } = renderWithIntl(
        <PolicyWhoHowCard policy={BASE_POLICY} onPatch={vi.fn()} />,
      );
      expect(screen.getByTestId('policy-recurring-horizon')).toBeDisabled();

      rerender(<PolicyWhoHowCard policy={RECURRING_POLICY} onPatch={vi.fn()} />);
      expect(screen.getByTestId('policy-recurring-horizon')).toBeEnabled();
    });

    it('calls onPatch with the parsed number, and with null when cleared', async () => {
      const user = userEvent.setup();
      const onPatch = vi.fn();
      renderWithIntl(
        <PolicyWhoHowCard
          policy={{ ...RECURRING_POLICY, recurringHorizonDays: 6 }}
          onPatch={onPatch}
        />,
      );

      await user.type(screen.getByTestId('policy-recurring-horizon'), '0');
      expect(onPatch).toHaveBeenCalledWith({ recurringHorizonDays: 60 });

      await user.clear(screen.getByTestId('policy-recurring-horizon'));
      expect(onPatch).toHaveBeenLastCalledWith({ recurringHorizonDays: null });
    });

    it('shows no error for a blank or in-range value', () => {
      const { rerender } = renderWithIntl(
        <PolicyWhoHowCard policy={RECURRING_POLICY} onPatch={vi.fn()} />,
      );
      expect(screen.queryByTestId('policy-recurring-horizon-error')).not.toBeInTheDocument();

      rerender(
        <PolicyWhoHowCard
          policy={{ ...RECURRING_POLICY, recurringHorizonDays: 180 }}
          onPatch={vi.fn()}
        />,
      );
      expect(screen.queryByTestId('policy-recurring-horizon-error')).not.toBeInTheDocument();
    });

    it.each([0, 181, 1.5])('shows the inline range error for %j', (value) => {
      renderWithIntl(
        <PolicyWhoHowCard
          policy={{ ...RECURRING_POLICY, recurringHorizonDays: value }}
          onPatch={vi.fn()}
        />,
      );

      expect(screen.getByTestId('policy-recurring-horizon-error')).toHaveTextContent(
        'Informe um número inteiro de 1 a 180 dias.',
      );
      const input = screen.getByTestId('policy-recurring-horizon');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-errormessage', 'policy-recurring-horizon-error');
      expect(input).toHaveAccessibleDescription(
        expect.stringContaining('Informe um número inteiro de 1 a 180 dias.'),
      );
    });

    it('does not reference the error element while the value is valid', () => {
      renderWithIntl(<PolicyWhoHowCard policy={RECURRING_POLICY} onPatch={vi.fn()} />);

      const input = screen.getByTestId('policy-recurring-horizon');
      expect(input).not.toHaveAttribute('aria-errormessage');
      expect(input).toHaveAttribute('aria-describedby', 'policy-recurring-horizon-hint');
    });
  });

  // TD49-S03 / UC-055 step 3: the advisory recurrence hint under the toggle.
  describe('the recurrence hint', () => {
    it('is absent when nothing blocks recurrence', () => {
      renderWithIntl(
        <PolicyWhoHowCard policy={BASE_POLICY} onPatch={vi.fn()} recurrenceBlockers={[]} />,
      );
      expect(screen.queryByTestId('policy-recurrence-hint')).not.toBeInTheDocument();
    });

    it('lists every reason, whatever the toggle says', () => {
      renderWithIntl(
        <PolicyWhoHowCard
          policy={{ ...BASE_POLICY, recurrenceEligible: true }}
          onPatch={vi.fn()}
          recurrenceBlockers={['legs', 'pickup-address']}
        />,
      );
      const hint = screen.getByTestId('policy-recurrence-hint');
      expect(hint).toHaveTextContent('ele tem etapas; ele exige endereço de coleta');
      expect(hint).toHaveAttribute('role', 'note');
    });
  });
});
