// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FooterModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { Footer } from './Footer';

function makeBusiness(
  overrides: Partial<HotsiteBusinessInfoResponse> = {},
): HotsiteBusinessInfoResponse {
  return {
    phone: null,
    email: null,
    address: null,
    socialLinks: {
      whatsapp: '(31) 99999-0000',
      instagram: null,
      facebook: null,
      ...overrides.socialLinks,
    },
    ...overrides,
  };
}

function makeData(overrides: Partial<FooterModuleData> = {}): FooterModuleData {
  return {
    tagline: 'Atendimento de qualidade',
    copyrightNote: 'Todos os direitos reservados.',
    showWhatsapp: true,
    ...overrides,
  };
}

describe('Footer', () => {
  // Pins the clock so the copyright year read by Footer's render and by this file's own
  // `new Date().getFullYear()` assertions can never disagree by straddling a real Dec 31 -> Jan
  // 1 rollover between the two reads (CodeRabbit finding on PR #296).
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the brand, tagline, copyright, and whatsapp link', () => {
    renderWithIntl(
      <Footer
        slug="lavacar-beloauto"
        data={makeData()}
        tenantName="Lavacar BeloAuto"
        business={makeBusiness()}
        logoUrl="tenants/tenant-1/hotsite/branding/logo.webp"
      />,
    );

    expect(screen.getByTestId('footer-brand-name')).toHaveTextContent('Lavacar BeloAuto');
    expect(screen.getByTestId('footer-tagline')).toHaveTextContent('Atendimento de qualidade');
    expect(screen.getByTestId('footer-copyright')).toHaveTextContent(
      `© ${new Date().getFullYear()} Lavacar BeloAuto. Todos os direitos reservados.`,
    );
    expect(screen.getByTestId('footer-whatsapp')).toHaveAttribute(
      'href',
      'https://wa.me/31999990000',
    );
  });

  it('falls back to the translated default copyright note when none is configured', () => {
    renderWithIntl(
      <Footer
        slug="lavacar-beloauto"
        data={makeData({ copyrightNote: undefined })}
        tenantName="Lavacar BeloAuto"
        business={makeBusiness()}
        logoUrl="tenants/tenant-1/hotsite/branding/logo.webp"
      />,
    );

    expect(screen.getByTestId('footer-copyright')).toHaveTextContent(
      `© ${new Date().getFullYear()} Lavacar BeloAuto. Todos os direitos reservados.`,
    );
  });

  it('hides the whatsapp link when disabled', () => {
    renderWithIntl(
      <Footer
        slug="lavacar-beloauto"
        data={makeData({ showWhatsapp: false })}
        tenantName="Lavacar BeloAuto"
        business={makeBusiness()}
        logoUrl="tenants/tenant-1/hotsite/branding/logo.webp"
      />,
    );

    expect(screen.queryByTestId('footer-whatsapp')).not.toBeInTheDocument();
  });

  // M18-S03 — brand mark (logo or initial-letter fallback), above the brand name.
  describe('brand mark', () => {
    it('renders the logo image when logoUrl is set', () => {
      renderWithIntl(
        <Footer
          slug="lavacar-beloauto"
          data={makeData()}
          tenantName="Lavacar BeloAuto"
          business={makeBusiness()}
          logoUrl="tenants/tenant-1/hotsite/branding/logo.webp"
        />,
      );

      const img = screen.getByAltText('Lavacar BeloAuto');
      expect(img.tagName).toBe('IMG');
    });

    it('falls back to an initial-letter badge when logoUrl is empty', () => {
      renderWithIntl(
        <Footer
          slug="lavacar-beloauto"
          data={makeData()}
          tenantName="Lavacar BeloAuto"
          business={makeBusiness()}
          logoUrl=""
        />,
      );

      expect(screen.queryByAltText('Lavacar BeloAuto')).not.toBeInTheDocument();
      expect(screen.getByText('L')).toBeInTheDocument();
    });
  });
});
