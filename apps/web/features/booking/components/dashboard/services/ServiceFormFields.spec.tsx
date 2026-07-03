// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import type { AbstractIntlMessages } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { renderWithIntl } from '@/test-utils';
import { ServiceFormFields } from './ServiceFormFields';

describe('ServiceFormFields', () => {
  it('renders the shared service fields and optional content', () => {
    renderWithIntl(
      <ServiceFormFields
        name=""
        description=""
        priceAmount=""
        durationMinutes=""
        loyaltyPointsValue="0"
        requiresPickupAddress={false}
        fieldErrors={{}}
        onNameChange={vi.fn()}
        onDescriptionChange={vi.fn()}
        onPriceAmountChange={vi.fn()}
        onDurationMinutesChange={vi.fn()}
        onLoyaltyPointsValueChange={vi.fn()}
        onToggleRequiresPickupAddress={vi.fn()}
      >
        <p>Extra</p>
      </ServiceFormFields>,
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
});
