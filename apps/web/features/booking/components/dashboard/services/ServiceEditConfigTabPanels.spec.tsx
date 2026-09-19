// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceIntakeSchemaResponse, StaffServiceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ServiceEditConfigTabPanels } from './ServiceEditConfigTabPanels';

vi.mock('@/features/booking/services/useServices', () => ({
  useUpdateServiceResourceRequirements: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateServiceLegs: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateServiceBookingPolicy: () => ({ mutateAsync: vi.fn(), isPending: false }),
  usePublishServiceIntakeSchema: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/features/booking/hooks/useResources', () => ({
  useResources: () => ({ data: { items: [] } }),
}));

const intakeSchema: ServiceIntakeSchemaResponse = { active: null, history: [] };

const service: StaffServiceResponse = {
  serviceId: 'svc-1',
  name: 'Lavagem Completa',
  description: 'Serviço completo',
  price: { amount: 180, currency: 'BRL' },
  durationMinutes: 60,
  loyaltyPointsValue: 20,
  requiresPickupAddress: true,
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
  bookingModel: 'APPOINTMENT',
  resourceRequirements: [],
  bufferAfterMinutes: null,
  legs: null,
  classResourceSlots: null,
  bookingPolicy: {
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
  },
};

describe('ServiceEditConfigTabPanels', () => {
  it('renders all 3 panels mounted, hiding all but the active tab via the hidden attribute', () => {
    renderWithIntl(
      <ServiceEditConfigTabPanels
        activeTab="recursos"
        service={service}
        intakeSchema={intakeSchema}
        onTabDirtyChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('tabpanel', { hidden: false })).toHaveAttribute(
      'id',
      'service-edit-tabpanel-recursos',
    );
    expect(document.getElementById('service-edit-tabpanel-politicas')).toHaveAttribute('hidden');
    expect(document.getElementById('service-edit-tabpanel-formulario')).toHaveAttribute('hidden');
  });

  it('forwards a dirty-change callback per tab', async () => {
    const user = userEvent.setup();
    const onTabDirtyChange = vi.fn();
    renderWithIntl(
      <ServiceEditConfigTabPanels
        activeTab="recursos"
        service={service}
        intakeSchema={intakeSchema}
        onTabDirtyChange={onTabDirtyChange}
      />,
    );

    await user.click(screen.getByTestId('resource-mode-legs'));
    expect(onTabDirtyChange).toHaveBeenCalledWith('recursos', true);
  });
});
