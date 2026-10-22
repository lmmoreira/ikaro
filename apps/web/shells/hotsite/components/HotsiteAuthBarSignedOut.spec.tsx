// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'jest-axe';
import { renderWithIntl } from '@/test-utils';
import { HotsiteAuthBarSignedOut } from './HotsiteAuthBarSignedOut';

const SLUG = 'lavacar-beloauto';
const LOGO_URL = 'https://cdn.example.com/tenants/tenant-1/hotsite/branding/logo.webp';
const TENANT_NAME = 'BeloAuto';

describe('HotsiteAuthBarSignedOut', () => {
  it('renders the logo image when logoUrl is set', () => {
    renderWithIntl(
      <HotsiteAuthBarSignedOut slug={SLUG} logoUrl={LOGO_URL} tenantName={TENANT_NAME} />,
    );

    expect(screen.getByAltText(TENANT_NAME).tagName).toBe('IMG');
  });

  it('falls back to an initial-letter badge when logoUrl is empty', () => {
    renderWithIntl(<HotsiteAuthBarSignedOut slug={SLUG} logoUrl="" tenantName={TENANT_NAME} />);

    expect(screen.queryByAltText(TENANT_NAME)).not.toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it.each([
    ['hotsite-staff-link', `/dashboard/login?tenantSlug=${SLUG}`, 'Área da Equipe'],
    ['hotsite-login-link', `/${SLUG}/login`, 'Entrar'],
  ])('renders the %s link to %s labelled "%s"', (testId, href, label) => {
    renderWithIntl(
      <HotsiteAuthBarSignedOut slug={SLUG} logoUrl={LOGO_URL} tenantName={TENANT_NAME} />,
    );

    const link = screen.getByTestId(testId);
    expect(link).toHaveAttribute('href', href);
    expect(link).toHaveTextContent(label);
  });

  it('colours the bar and the sign-in link from the branding variables', () => {
    renderWithIntl(
      <HotsiteAuthBarSignedOut slug={SLUG} logoUrl={LOGO_URL} tenantName={TENANT_NAME} />,
    );

    expect(screen.getByTestId('hotsite-auth-bar')).toHaveStyle({
      backgroundColor: 'var(--ba-secondary)',
    });
    expect(screen.getByTestId('hotsite-login-link')).toHaveStyle({ color: 'var(--ba-primary)' });
  });

  it('is interactive on its own: no ancestor is inert', () => {
    renderWithIntl(
      <HotsiteAuthBarSignedOut slug={SLUG} logoUrl={LOGO_URL} tenantName={TENANT_NAME} />,
    );

    expect(screen.getByTestId('hotsite-auth-bar').closest('[inert]')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithIntl(
      <HotsiteAuthBarSignedOut slug={SLUG} logoUrl={LOGO_URL} tenantName={TENANT_NAME} />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
