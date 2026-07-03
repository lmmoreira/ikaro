// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FooterModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
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
  it('renders the brand, tagline, copyright, and whatsapp link', () => {
    render(
      <Footer
        slug="lavacar-beloauto"
        data={makeData()}
        tenantName="Lavacar BeloAuto"
        business={makeBusiness()}
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

  it('hides the whatsapp link when disabled', () => {
    render(
      <Footer
        slug="lavacar-beloauto"
        data={makeData({ showWhatsapp: false })}
        tenantName="Lavacar BeloAuto"
        business={makeBusiness()}
      />,
    );

    expect(screen.queryByTestId('footer-whatsapp')).not.toBeInTheDocument();
  });
});
