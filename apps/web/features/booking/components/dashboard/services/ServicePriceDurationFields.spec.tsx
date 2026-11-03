// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { ServicePriceDurationFields } from './ServicePriceDurationFields';

type FieldsProps = Omit<Parameters<typeof ServicePriceDurationFields>[0], 'feedback'> & {
  readonly errors?: Record<string, string>;
};

// Wires the real hook the parent form owns, so the spec exercises the same field marking.
function Fields({ errors, ...props }: FieldsProps): React.JSX.Element {
  const feedback = useFormFeedback();
  const { setFieldErrors } = feedback;
  useEffect(() => {
    if (errors) setFieldErrors(errors);
  }, [errors, setFieldErrors]);
  return <ServicePriceDurationFields {...props} feedback={feedback} />;
}

const baseProps = {
  priceAmount: '10',
  durationMinutes: '30',
  onPriceAmountChange: vi.fn(),
  onDurationMinutesChange: vi.fn(),
};

describe('ServicePriceDurationFields', () => {
  it('shows the price edit-warning hint when there is no price error', () => {
    renderWithIntl(<Fields {...baseProps} />);

    expect(screen.getByTestId('service-price-input')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('service-price-input')).toHaveAttribute(
      'aria-describedby',
      'service-price-warning',
    );
  });

  it('shows the price error with the red outline instead of the warning hint', () => {
    renderWithIntl(
      <Fields {...baseProps} priceAmount="-1" errors={{ priceAmount: 'Preço inválido' }} />,
    );

    const input = screen.getByTestId('service-price-input');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('ring-red-600');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)).toHaveTextContent('Preço inválido');
    expect(document.getElementById('service-price-warning')).toBeNull();
  });

  it('locks the duration as read-only with the legs hint when durationLocked is set', () => {
    renderWithIntl(<Fields {...baseProps} durationMinutes="80" durationLocked />);

    const input = screen.getByTestId('service-duration-input');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAttribute('aria-readonly', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'service-duration-locked-hint');
    expect(screen.getByTestId('service-duration-locked-hint')).toBeInTheDocument();
  });

  it('keeps the duration editable with no locked hint by default', () => {
    renderWithIntl(<Fields {...baseProps} />);

    expect(screen.getByTestId('service-duration-input')).not.toHaveAttribute('readonly');
    expect(screen.queryByTestId('service-duration-locked-hint')).not.toBeInTheDocument();
  });

  it('marks the duration and describes it by its error when durationMinutes has an error', () => {
    renderWithIntl(
      <Fields
        {...baseProps}
        durationMinutes="0"
        errors={{ durationMinutes: 'Duração inválida' }}
      />,
    );

    const input = screen.getByTestId('service-duration-input');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveClass('ring-red-600');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)).toHaveTextContent('Duração inválida');
  });

  it('calls onPriceAmountChange and onDurationMinutesChange when each input changes', async () => {
    const user = userEvent.setup();
    const onPriceAmountChange = vi.fn();
    const onDurationMinutesChange = vi.fn();
    renderWithIntl(
      <Fields
        priceAmount=""
        durationMinutes=""
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
