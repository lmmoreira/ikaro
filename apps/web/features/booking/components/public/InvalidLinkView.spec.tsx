// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { InvalidLinkView } from './InvalidLinkView';

describe('InvalidLinkView', () => {
  it('renders the generic invalid-link reasons list for reason="invalid"', () => {
    renderWithIntl(
      <InvalidLinkView reason="invalid" tenantName="BeloAuto" tenantSlug="belo-auto" />,
    );

    expect(screen.getByTestId('invalid-link-heading')).toBeInTheDocument();
    expect(screen.getByTestId('invalid-reasons-list')).toBeInTheDocument();
    expect(screen.queryByTestId('processed-message')).not.toBeInTheDocument();
  });

  it('renders the distinct processed message for reason="processed"', () => {
    renderWithIntl(<InvalidLinkView reason="processed" tenantName="BeloAuto" />);

    expect(screen.getByTestId('processed-message')).toBeInTheDocument();
    expect(screen.queryByTestId('invalid-reasons-list')).not.toBeInTheDocument();
  });

  it('links "Ir para o site" to the tenant hotsite when tenantSlug is present', () => {
    renderWithIntl(<InvalidLinkView reason="invalid" tenantSlug="belo-auto" />);

    expect(screen.getByTestId('go-to-site-link')).toHaveAttribute('href', '/belo-auto');
  });

  it('falls back to "/" and omits the login link when tenantSlug is absent', () => {
    renderWithIntl(<InvalidLinkView reason="invalid" />);

    expect(screen.getByTestId('go-to-site-link')).toHaveAttribute('href', '/');
    expect(screen.queryByTestId('login-link')).not.toBeInTheDocument();
  });
});
