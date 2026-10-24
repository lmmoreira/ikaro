// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hotsiteServiceBookingDefaults, renderWithIntl } from '@/test-utils';
import { ServiceActionLink } from './ServiceActionLink';

const service = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Lavagem',
  description: null,
  price: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
  durationMinutes: 60,
  loyaltyPointsValue: 0,
  requiresPickupAddress: false,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...hotsiteServiceBookingDefaults,
  publicSlug: 'lavagem',
};

describe('ServiceActionLink', () => {
  it('opens a published service detail page', () => {
    renderWithIntl(
      <ServiceActionLink
        service={service}
        action={{ slug: 'tenant', kind: 'details', label: 'Ver detalhes' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Ver detalhes' })).toHaveAttribute(
      'href',
      '/tenant/servicos/lavagem',
    );
  });

  it('falls back to booking when the public page is absent', () => {
    renderWithIntl(
      <ServiceActionLink
        service={{ ...service, publicSlug: null }}
        action={{
          slug: 'tenant',
          kind: 'details',
          label: 'Ver detalhes',
          fallbackLabel: 'Agendar',
        }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Agendar' })).toHaveAttribute(
      'href',
      '/tenant/booking?serviceId=00000000-0000-0000-0000-000000000001',
    );
  });
});
