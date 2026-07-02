// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
import { describe, expect, it } from 'vitest';
import type { ContactModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ContactModule } from './ContactModule';

function makeBusiness(
  overrides?: Partial<HotsiteBusinessInfoResponse>,
): HotsiteBusinessInfoResponse {
  return {
    phone: '11987654321',
    email: 'contato@beloauto.com.br',
    address: {
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310100',
    },
    socialLinks: { whatsapp: '11987654321', instagram: null, facebook: null },
    ...overrides,
  };
}

function makeData(overrides?: Partial<ContactModuleData>): ContactModuleData {
  return {
    showAddress: true,
    showPhone: true,
    showWhatsapp: true,
    showEmail: true,
    showMap: true,
    ...overrides,
  };
}

describe('ContactModule', () => {
  it('renders the default title when none is provided', () => {
    renderWithIntl(<ContactModule data={makeData()} business={makeBusiness()} slug="tenant" />);

    expect(screen.getByRole('heading', { name: 'Fale conosco' })).toBeInTheDocument();
  });

  it('renders a custom title when provided', () => {
    renderWithIntl(
      <ContactModule
        data={makeData({ title: 'Contato' })}
        business={makeBusiness()}
        slug="tenant"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Contato' })).toBeInTheDocument();
  });

  it('renders no <iframe> when showMap is false', () => {
    const { container } = renderWithIntl(
      <ContactModule data={makeData({ showMap: false })} business={makeBusiness()} slug="tenant" />,
    );

    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });

  it('renders no <iframe> when showMap is true but business.address is null', () => {
    const { container } = renderWithIntl(
      <ContactModule
        data={makeData({ showMap: true })}
        business={makeBusiness({ address: null })}
        slug="tenant"
      />,
    );

    expect(container.querySelector('iframe')).not.toBeInTheDocument();
  });

  it('renders no WhatsApp link when showWhatsapp is false', () => {
    renderWithIntl(
      <ContactModule
        data={makeData({ showWhatsapp: false })}
        business={makeBusiness()}
        slug="tenant"
      />,
    );

    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  it('renders the WhatsApp link to wa.me with digits-only number from business.socialLinks', () => {
    renderWithIntl(
      <ContactModule
        data={makeData()}
        business={makeBusiness({
          socialLinks: { whatsapp: '(11) 98765-4321', instagram: null, facebook: null },
        })}
        slug="tenant"
      />,
    );

    const link = screen.getByRole('link', { name: 'WhatsApp' });
    expect(link).toHaveAttribute('href', 'https://wa.me/11987654321');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders no address block when showAddress is false', () => {
    renderWithIntl(
      <ContactModule
        data={makeData({ showAddress: false })}
        business={makeBusiness()}
        slug="tenant"
      />,
    );

    expect(screen.queryByText(/Av\. Paulista/)).not.toBeInTheDocument();
  });

  it('renders no address block when showAddress is true but business.address is null', () => {
    renderWithIntl(
      <ContactModule
        data={makeData({ showAddress: true })}
        business={makeBusiness({ address: null })}
        slug="tenant"
      />,
    );

    expect(screen.queryByText(/Av\. Paulista/)).not.toBeInTheDocument();
  });

  it('renders no phone when showPhone is true but business.phone is null', () => {
    renderWithIntl(
      <ContactModule
        data={makeData({ showPhone: true })}
        business={makeBusiness({ phone: null })}
        slug="tenant"
      />,
    );

    expect(screen.queryByText('11987654321')).not.toBeInTheDocument();
  });

  it('renders no email when showEmail is true but business.email is null', () => {
    renderWithIntl(
      <ContactModule
        data={makeData({ showEmail: true })}
        business={makeBusiness({ email: null })}
        slug="tenant"
      />,
    );

    expect(screen.queryByText('contato@beloauto.com.br')).not.toBeInTheDocument();
  });

  it('renders Instagram and Facebook links from business.socialLinks', () => {
    renderWithIntl(
      <ContactModule
        data={makeData()}
        business={makeBusiness({
          socialLinks: {
            whatsapp: null,
            instagram: 'https://instagram.com/beloauto',
            facebook: 'https://facebook.com/beloauto',
          },
        })}
        slug="tenant"
      />,
    );

    expect(screen.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://instagram.com/beloauto',
    );
    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute(
      'href',
      'https://facebook.com/beloauto',
    );
  });

  it('does not render social links when business.socialLinks is null', () => {
    renderWithIntl(
      <ContactModule
        data={makeData()}
        business={makeBusiness({ socialLinks: null })}
        slug="tenant"
      />,
    );

    expect(screen.queryByRole('link', { name: 'Instagram' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Facebook' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  describe('eyebrow', () => {
    it('renders eyebrow when provided', () => {
      renderWithIntl(
        <ContactModule
          data={makeData({ eyebrow: 'Vem nos visitar' })}
          business={makeBusiness()}
          slug="tenant"
        />,
      );

      expect(screen.getByTestId('section-eyebrow')).toHaveTextContent('Vem nos visitar');
    });

    it('does not render eyebrow when absent', () => {
      const { container } = renderWithIntl(
        <ContactModule data={makeData()} business={makeBusiness()} slug="tenant" />,
      );

      expect(container.querySelector('[data-testid="section-eyebrow"]')).not.toBeInTheDocument();
    });
  });

  describe('displayStyle: icon-cards', () => {
    it('renders icon rows instead of plain text when displayStyle is "icon-cards"', () => {
      const { container } = renderWithIntl(
        <ContactModule
          data={makeData({ displayStyle: 'icon-cards' })}
          business={makeBusiness()}
          slug="tenant"
        />,
      );

      expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    });
  });

  describe('showInstagram / showFacebook toggles', () => {
    it('hides Instagram when showInstagram is false even if URL exists', () => {
      renderWithIntl(
        <ContactModule
          data={makeData({ showInstagram: false })}
          business={makeBusiness({
            socialLinks: {
              whatsapp: null,
              instagram: 'https://instagram.com/test',
              facebook: null,
            },
          })}
          slug="tenant"
        />,
      );

      expect(screen.queryByRole('link', { name: 'Instagram' })).not.toBeInTheDocument();
    });

    it('hides Facebook when showFacebook is false even if URL exists', () => {
      renderWithIntl(
        <ContactModule
          data={makeData({ showFacebook: false })}
          business={makeBusiness({
            socialLinks: { whatsapp: null, instagram: null, facebook: 'https://facebook.com/test' },
          })}
          slug="tenant"
        />,
      );

      expect(screen.queryByRole('link', { name: 'Facebook' })).not.toBeInTheDocument();
    });
  });

  describe('whatsappCtaLabel', () => {
    it('uses custom label for the WhatsApp link when whatsappCtaLabel is provided', () => {
      renderWithIntl(
        <ContactModule
          data={makeData({ whatsappCtaLabel: 'Chamar no WhatsApp' })}
          business={makeBusiness()}
          slug="tenant"
        />,
      );

      expect(screen.getByRole('link', { name: 'Chamar no WhatsApp' })).toBeInTheDocument();
    });
  });

  it('has no axe violations', async () => {
    const { container } = renderWithIntl(
      <ContactModule data={makeData()} business={makeBusiness()} slug="tenant" />,
    );

    // iframes (Google Maps embed) cannot be scanned by axe in jsdom — disable frame scanning.
    expect(await axe(container, { iframes: false })).toHaveNoViolations();
  });
});
