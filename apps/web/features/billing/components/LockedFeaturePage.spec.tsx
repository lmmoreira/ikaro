// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { LockedFeaturePage } from './LockedFeaturePage';

describe('LockedFeaturePage', () => {
  it('renders the route variant of the locked card for the feature', () => {
    renderWithIntl(<LockedFeaturePage feature="LEAD_FORM" />);

    const card = screen.getByTestId('locked-feature-card');
    expect(card).toHaveAttribute('data-feature', 'LEAD_FORM');
    expect(screen.getByRole('heading', { name: 'Recurso não contratado' })).toBeInTheDocument();
    expect(screen.getByTestId('locked-feature-kept')).toHaveTextContent(
      'Seus dados já registrados foram mantidos',
    );
  });

  it('is a plain page: no link or button, the nav is the way out', () => {
    renderWithIntl(<LockedFeaturePage feature="LOYALTY" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
