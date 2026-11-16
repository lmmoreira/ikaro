// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import type { HotsiteManifestResponse } from '@ikaro/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { clearPublicEnv, renderWithIntl, stubPublicEnv } from '@/test-utils';
import { UnavailablePage } from './UnavailablePage';

const SLUG = 'lavacar-beloauto';

type ManifestInput = Pick<HotsiteManifestResponse, 'branding' | 'layout' | 'tenant'>;

function makeManifest(overrides: Partial<ManifestInput> = {}): ManifestInput {
  return {
    tenant: { id: '00000000-0000-0000-0000-000000000001', name: 'Lavacar BeloAuto', slug: SLUG },
    branding: {
      logoUrl: '',
      primaryColor: '#0055A4',
      secondaryColor: '#FFFFFF',
      backgroundColor: '#F5F5F5',
      textColor: '#111111',
      headingFontFamily: 'Inter',
      bodyFontFamily: 'Roboto',
      borderRadius: 'rounded',
      spacing: 'comfortable',
      shadowStyle: 'subtle',
      buttonStyle: 'filled',
    },
    layout: [],
    ...overrides,
  };
}

function mockSignedOutSession(): void {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (String(input).includes('/api/session')) {
      return new Response(JSON.stringify({ staff: null, customer: null }), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${String(input)}`);
  });
}

beforeEach(() => {
  stubPublicEnv({ NEXT_PUBLIC_BFF_URL: 'http://bff-test:3002/v1' });
  mockSignedOutSession();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearPublicEnv();
});

describe('UnavailablePage', () => {
  it('renders the top bar with both login links over the neutral message', async () => {
    renderWithIntl(<UnavailablePage slug={SLUG} manifest={makeManifest()} />);

    expect(await screen.findByTestId('hotsite-staff-link')).toHaveAttribute(
      'href',
      `/dashboard/login?tenantSlug=${SLUG}`,
    );
    expect(screen.getByTestId('hotsite-login-link')).toHaveAttribute('href', `/${SLUG}/login`);
    expect(screen.getByRole('heading', { name: 'Página indisponível' })).toBeInTheDocument();
  });

  it('shows only the requested tenant name in the bar (tenant isolation)', async () => {
    renderWithIntl(
      <UnavailablePage
        slug={SLUG}
        manifest={makeManifest({
          tenant: { id: '00000000-0000-0000-0000-000000000002', name: 'Outra Empresa', slug: SLUG },
        })}
      />,
    );

    await screen.findByTestId('hotsite-staff-link');
    expect(screen.getByText('O')).toBeInTheDocument();
    expect(screen.queryByText('Lavacar BeloAuto')).not.toBeInTheDocument();
  });

  it('prefers the brand name over the tenant name', async () => {
    renderWithIntl(
      <UnavailablePage
        slug={SLUG}
        manifest={makeManifest({
          branding: { ...makeManifest().branding, brandName: 'Zeta Brand' },
        })}
      />,
    );

    await screen.findByTestId('hotsite-staff-link');
    expect(screen.getByText('Z')).toBeInTheDocument();
  });

  it('renders no navigation links for an unpublished manifest (empty layout)', async () => {
    renderWithIntl(<UnavailablePage slug={SLUG} manifest={makeManifest({ layout: [] })} />);

    await screen.findByTestId('hotsite-staff-link');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('keeps the navigation links of a published hotsite whose module is disabled', async () => {
    renderWithIntl(
      <UnavailablePage
        slug={SLUG}
        manifest={makeManifest({
          layout: [
            {
              type: 'NAVIGATION',
              enabled: true,
              data: { items: [{ target: 'home', label: 'Início' }] },
            },
          ],
        })}
      />,
    );

    await waitFor(() => expect(screen.getAllByText('Início').length).toBeGreaterThan(0));
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(<UnavailablePage slug={SLUG} manifest={makeManifest()} />);

    await screen.findByTestId('hotsite-staff-link');
    expect(await axe(container)).toHaveNoViolations();
  });
});
