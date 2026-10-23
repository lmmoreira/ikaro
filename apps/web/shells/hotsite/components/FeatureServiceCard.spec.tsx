// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hotsiteServiceBookingDefaults, renderWithIntl } from '@/test-utils';
import { FeatureServiceCard } from './FeatureServiceCard';

describe('FeatureServiceCard', () => {
  it('uses a distinct tint for adjacent cards when requested', () => {
    const service = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Wash',
      description: null,
      price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
      durationMinutes: 60,
      loyaltyPointsValue: 10,
      requiresPickupAddress: false,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      ...hotsiteServiceBookingDefaults,
    };
    renderWithIntl(
      <ul>
        <FeatureServiceCard
          service={service}
          showPrices
          showPoints
          cardBg="white"
          tone="tinted"
          index={0}
        />
        <FeatureServiceCard
          service={{ ...service, id: '00000000-0000-0000-0000-000000000002' }}
          showPrices
          showPoints
          cardBg="white"
          tone="tinted"
          index={1}
        />
      </ul>,
    );
    const cards = screen.getAllByTestId('feature-service-card');
    expect(cards[0].style.backgroundColor).not.toBe(cards[1].style.backgroundColor);
  });
});
