// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import type { AbstractIntlMessages } from 'next-intl';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { renderWithIntl } from '@/test-utils';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { ServiceFormFields } from './ServiceFormFields';

type FieldsProps = Omit<Parameters<typeof ServiceFormFields>[0], 'feedback'> & {
  readonly errors?: Record<string, string>;
};

// Wires the real hook the parent form owns, so the spec exercises the same field marking.
function Fields({ errors, ...props }: FieldsProps): React.JSX.Element {
  const feedback = useFormFeedback();
  const { setFieldErrors } = feedback;
  useEffect(() => {
    if (errors) setFieldErrors(errors);
  }, [errors, setFieldErrors]);
  return <ServiceFormFields {...props} feedback={feedback} />;
}

const baseProps = {
  name: '',
  description: '',
  priceAmount: '',
  durationMinutes: '',
  loyaltyPointsValue: '0',
  requiresPickupAddress: false,
  onNameChange: vi.fn(),
  onDescriptionChange: vi.fn(),
  onPriceAmountChange: vi.fn(),
  onDurationMinutesChange: vi.fn(),
  onLoyaltyPointsValueChange: vi.fn(),
  onToggleRequiresPickupAddress: vi.fn(),
};

describe('ServiceFormFields', () => {
  it('renders the shared service fields and optional content', () => {
    renderWithIntl(
      <Fields {...baseProps}>
        <p>Extra</p>
      </Fields>,
      {
        locale: 'en',
        messages: ptBRMessages as AbstractIntlMessages,
        formattingOverrides: {
          currency: 'USD',
        },
      },
    );

    expect(screen.getByLabelText('Nome do serviço')).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição')).toBeInTheDocument();
    expect(screen.getByLabelText('Preço')).toBeInTheDocument();
    expect(screen.getByLabelText('Duração')).toBeInTheDocument();
    expect(screen.getByLabelText('Pontos de fidelidade')).toBeInTheDocument();
    expect(screen.getByTestId('service-pickup-switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Opções')).toBeInTheDocument();
    expect(screen.getByText('Extra')).toBeInTheDocument();
    expect(screen.getByText('$')).toBeInTheDocument();
  });

  it('hides the pickup switch when hidePickupToggle is true', () => {
    renderWithIntl(<Fields {...baseProps} hidePickupToggle />);

    expect(screen.queryByTestId('service-pickup-switch')).not.toBeInTheDocument();
  });

  it('marks each field that has an error, with its message and the red outline', () => {
    renderWithIntl(
      <Fields
        {...baseProps}
        errors={{
          name: 'Informe o nome.',
          description: 'Descrição longa demais.',
          loyaltyPointsValue: 'Pontos inválidos.',
        }}
      />,
    );

    for (const [testId, message] of [
      ['service-name-input', 'Informe o nome.'],
      ['service-description-input', 'Descrição longa demais.'],
      ['service-points-input', 'Pontos inválidos.'],
    ] as const) {
      const input = screen.getByTestId(testId);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveClass('ring-red-600');
      expect(
        document.getElementById(input.getAttribute('aria-describedby') ?? ''),
      ).toHaveTextContent(message);
    }
  });

  it('leaves valid fields unmarked and keeps the points hint', () => {
    renderWithIntl(<Fields {...baseProps} />);

    expect(screen.getByTestId('service-name-input')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('service-points-input')).toHaveAttribute(
      'aria-describedby',
      'service-points-hint',
    );
    expect(screen.queryByTestId('service-submit-error')).not.toBeInTheDocument();
  });
});
