// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { ServiceEditDetailsTab } from './ServiceEditDetailsTab';

const baseProps = {
  serviceId: 'svc-1',
  isActive: true,
  name: 'Lavagem Completa',
  description: 'Descrição',
  priceAmount: '150',
  durationMinutes: '60',
  loyaltyPointsValue: '10',
  requiresPickupAddress: false,
  onNameChange: vi.fn(),
  onDescriptionChange: vi.fn(),
  onPriceAmountChange: vi.fn(),
  onDurationMinutesChange: vi.fn(),
  onLoyaltyPointsValueChange: vi.fn(),
  onToggleRequiresPickupAddress: vi.fn(),
};

function Tab(props: Partial<Parameters<typeof ServiceEditDetailsTab>[0]>): React.JSX.Element {
  const feedback = useFormFeedback();
  return <ServiceEditDetailsTab {...baseProps} {...props} feedback={feedback} />;
}

describe('ServiceEditDetailsTab', () => {
  it('renders the tabpanel with the shared form fields prefilled', () => {
    renderWithIntl(<Tab />);

    expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'service-edit-tabpanel-detalhes');
    expect(screen.getByLabelText('Nome do serviço')).toHaveValue('Lavagem Completa');
  });

  it('renders no success box of its own: the created message lives in the pane', () => {
    renderWithIntl(<Tab />);

    expect(screen.queryByTestId('service-created-banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the deactivate link when active, and none when inactive', () => {
    const { rerender } = renderWithIntl(<Tab />);
    expect(screen.getByTestId('service-deactivate-link')).toBeInTheDocument();

    rerender(<Tab isActive={false} />);
    expect(screen.queryByTestId('service-deactivate-link')).not.toBeInTheDocument();
  });
});
