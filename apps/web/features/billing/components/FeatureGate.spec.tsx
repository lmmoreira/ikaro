// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { FeatureGate } from './FeatureGate';

describe('FeatureGate', () => {
  it('renders the children when the route feature is entitled', () => {
    renderWithIntl(
      <FeatureGate feature="LOYALTY" lockedFeatures={['CHATBOT']}>
        <p>loyalty page</p>
      </FeatureGate>,
    );

    expect(screen.getByText('loyalty page')).toBeInTheDocument();
    expect(screen.queryByTestId('locked-feature-card')).not.toBeInTheDocument();
  });

  it('renders the locked page instead of the children when the route feature is locked', () => {
    renderWithIntl(
      <FeatureGate feature="LOYALTY" lockedFeatures={['LOYALTY', 'CHATBOT']}>
        <p>loyalty page</p>
      </FeatureGate>,
    );

    expect(screen.queryByText('loyalty page')).not.toBeInTheDocument();
    expect(screen.getByTestId('locked-feature-card')).toHaveAttribute('data-feature', 'LOYALTY');
  });

  it('renders the children when nothing is locked (a failed access lookup fails open)', () => {
    renderWithIntl(
      <FeatureGate feature="LOYALTY" lockedFeatures={[]}>
        <p>loyalty page</p>
      </FeatureGate>,
    );

    expect(screen.getByText('loyalty page')).toBeInTheDocument();
  });

  it('renders the children for an ungated route even when features are locked', () => {
    renderWithIntl(
      <FeatureGate feature={null} lockedFeatures={['LOYALTY', 'CHATBOT']}>
        <p>entry page</p>
      </FeatureGate>,
    );

    expect(screen.getByText('entry page')).toBeInTheDocument();
  });
});
