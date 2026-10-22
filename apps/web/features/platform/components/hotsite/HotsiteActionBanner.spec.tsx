// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { HotsiteActionBanner } from './HotsiteActionBanner';

describe('HotsiteActionBanner', () => {
  it('renders nothing without a banner', () => {
    const { container } = renderWithIntl(<HotsiteActionBanner banner={null} tenantSlug="acme" />);

    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['publish', 'Hotsite atualizado e no ar!'],
    ['unpublish', 'Hotsite offline'],
  ] as const)('renders the %s success banner with the tenant slug in its body', (kind, title) => {
    renderWithIntl(<HotsiteActionBanner banner={{ kind, status: 'success' }} tenantSlug="acme" />);

    const banner = screen.getByTestId('hotsite-action-success-banner');
    expect(banner).toHaveTextContent(title);
    expect(banner).toHaveTextContent('@acme');
  });

  it('renders the error message in an alert', () => {
    renderWithIntl(
      <HotsiteActionBanner
        banner={{ kind: 'publish', status: 'error', message: 'Falha ao publicar' }}
        tenantSlug="acme"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao publicar');
    expect(screen.getByTestId('hotsite-action-error-banner')).toBeInTheDocument();
  });
});
