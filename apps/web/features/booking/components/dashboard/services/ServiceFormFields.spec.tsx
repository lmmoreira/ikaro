// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ServiceFormFields } from './ServiceFormFields';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      createNameLabel: 'Nome do serviço',
      createNamePlaceholder: 'Digite o nome',
      createDescriptionLabel: 'Descrição',
      createDescriptionPlaceholder: 'Digite a descrição',
      createPriceLabel: 'Preço',
      createPricePlaceholder: '0,00',
      createDurationLabel: 'Duração',
      createDurationPlaceholder: '60',
      createPointsLabel: 'Pontos de fidelidade',
      createPointsPlaceholder: '0',
      createPointsHint: 'Use 0 para não pontuar',
      createPickupLabel: 'Coleta e entrega',
      createPickupHint: 'Marque para exigir endereço',
      servicesOptionsTitle: 'Opções',
      editPriceWarning: 'O preço é obrigatório',
      createNameRequired: 'Informe o nome do serviço.',
      createPriceRequired: 'Informe o preço do serviço.',
      createDurationRequired: 'Informe a duração do serviço.',
    };
    return map[key] ?? key;
  },
}));

describe('ServiceFormFields', () => {
  it('renders the shared service fields and optional content', () => {
    render(
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
    );

    expect(screen.getByLabelText('Nome do serviço')).toBeInTheDocument();
    expect(screen.getByLabelText('Descrição')).toBeInTheDocument();
    expect(screen.getByLabelText('Preço')).toBeInTheDocument();
    expect(screen.getByLabelText('Duração')).toBeInTheDocument();
    expect(screen.getByLabelText('Pontos de fidelidade')).toBeInTheDocument();
    expect(screen.getByTestId('service-pickup-switch')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Opções')).toBeInTheDocument();
    expect(screen.getByText('Extra')).toBeInTheDocument();
  });
});
