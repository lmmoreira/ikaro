// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CustomerFeatureKey } from '@ikaro/types';
import { CustomerFeaturesProvider, useHasCustomerFeature } from './customer-features-context';

function Probe(): React.JSX.Element {
  return (
    <span data-testid="probe">
      {String(useHasCustomerFeature('BOOKING'))}/{String(useHasCustomerFeature('LOYALTY'))}
    </span>
  );
}

function renderWith(features: readonly CustomerFeatureKey[] | null): void {
  render(
    <CustomerFeaturesProvider entitledFeatures={features}>
      <Probe />
    </CustomerFeaturesProvider>,
  );
}

describe('useHasCustomerFeature', () => {
  it('is true only for the features the tenant holds', () => {
    renderWith(['BOOKING']);
    expect(screen.getByTestId('probe')).toHaveTextContent('true/false');
  });

  it('is false for every feature when the tenant holds none', () => {
    renderWith([]);
    expect(screen.getByTestId('probe')).toHaveTextContent('false/false');
  });

  it('is true for every feature when the features are unknown', () => {
    renderWith(null);
    expect(screen.getByTestId('probe')).toHaveTextContent('true/true');
  });

  it('is true outside a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('true/true');
  });
});
