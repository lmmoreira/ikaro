// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ServiceEditDetailsTab } from './ServiceEditDetailsTab';

const baseProps = {
  serviceId: 'svc-1',
  isActive: true,
  showCreatedBanner: false,
  name: 'Lavagem Completa',
  description: 'Descrição',
  priceAmount: '150',
  durationMinutes: '60',
  loyaltyPointsValue: '10',
  requiresPickupAddress: false,
  fieldErrors: {},
  onNameChange: vi.fn(),
  onDescriptionChange: vi.fn(),
  onPriceAmountChange: vi.fn(),
  onDurationMinutesChange: vi.fn(),
  onLoyaltyPointsValueChange: vi.fn(),
  onToggleRequiresPickupAddress: vi.fn(),
};

describe('ServiceEditDetailsTab', () => {
  it('renders the tabpanel with the shared form fields prefilled', () => {
    renderWithIntl(<ServiceEditDetailsTab {...baseProps} />);

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'service-edit-tabpanel-detalhes');
    expect(screen.getByLabelText('Nome do serviço')).toHaveValue('Lavagem Completa');
  });

  it('shows the created-success banner when showCreatedBanner is true', () => {
    renderWithIntl(<ServiceEditDetailsTab {...baseProps} showCreatedBanner />);

    expect(screen.getByTestId('service-created-banner')).toBeInTheDocument();
  });

  it('hides the created-success banner by default', () => {
    renderWithIntl(<ServiceEditDetailsTab {...baseProps} />);

    expect(screen.queryByTestId('service-created-banner')).not.toBeInTheDocument();
  });

  it('renders the deactivate link when active, and none when inactive', () => {
    const { rerender } = renderWithIntl(<ServiceEditDetailsTab {...baseProps} />);
    expect(screen.getByTestId('service-deactivate-link')).toBeInTheDocument();

    rerender(<ServiceEditDetailsTab {...baseProps} isActive={false} />);
    expect(screen.queryByTestId('service-deactivate-link')).not.toBeInTheDocument();
  });
});
