// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ContactModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { IconCardsLayout, ListLayout, formatAddress } from './ContactModuleLayouts';

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

describe('formatAddress', () => {
  it('formats a full address with street, number, neighborhood, city, state, zip', () => {
    const address = makeBusiness().address!;
    expect(formatAddress(address)).toBe(
      'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310100',
    );
  });

  it('omits the complement/neighborhood segments when absent', () => {
    expect(
      formatAddress({
        street: 'Rua A',
        number: '10',
        city: 'City',
        state: 'ST',
        zipCode: '00000',
      }),
    ).toBe('Rua A, 10, City - ST, 00000');
  });
});

const commonProps = {
  showAddress: true,
  showPhone: true,
  showEmail: true,
  showInstagram: true,
  showFacebook: true,
};

describe('ListLayout', () => {
  it('renders address, phone, and email as plain text', () => {
    renderWithIntl(<ListLayout data={makeData()} business={makeBusiness()} {...commonProps} />);

    expect(screen.getByText(/Av\. Paulista/)).toBeInTheDocument();
    expect(screen.getByText('11987654321')).toBeInTheDocument();
    expect(screen.getByText('contato@beloauto.com.br')).toBeInTheDocument();
  });

  it('renders a WhatsApp link to wa.me with digits-only number when showWhatsapp is true', () => {
    renderWithIntl(
      <ListLayout
        data={makeData({ showWhatsapp: true })}
        business={makeBusiness()}
        {...commonProps}
      />,
    );

    expect(screen.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/11987654321',
    );
  });

  it('renders no WhatsApp link when showWhatsapp is false', () => {
    renderWithIntl(
      <ListLayout
        data={makeData({ showWhatsapp: false })}
        business={makeBusiness()}
        {...commonProps}
      />,
    );

    expect(screen.queryByRole('link', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  it('hides address/phone/email when their show flags are false', () => {
    renderWithIntl(
      <ListLayout
        data={makeData({ showWhatsapp: false })}
        business={makeBusiness()}
        showAddress={false}
        showPhone={false}
        showEmail={false}
        showInstagram={false}
        showFacebook={false}
      />,
    );

    expect(screen.queryByText(/Av\. Paulista/)).not.toBeInTheDocument();
    expect(screen.queryByText('11987654321')).not.toBeInTheDocument();
    expect(screen.queryByText('contato@beloauto.com.br')).not.toBeInTheDocument();
  });
});

describe('IconCardsLayout', () => {
  it('renders address, phone, and email inside icon rows', () => {
    renderWithIntl(
      <IconCardsLayout
        data={makeData()}
        business={makeBusiness()}
        {...commonProps}
        cardBg="#fff"
      />,
    );

    expect(screen.getByText(/Av\. Paulista/)).toBeInTheDocument();
    expect(screen.getByText('11987654321')).toBeInTheDocument();
    expect(screen.getByText('contato@beloauto.com.br')).toBeInTheDocument();
  });

  it('renders the WhatsApp CTA inside an icon row when showWhatsapp is true', () => {
    // Unlike ListLayout (default label "WhatsApp"), IconCardsLayout's default WhatsApp CTA label
    // is "Chamar no WhatsApp" (contact.whatsappDefaultCta) when data.whatsappCtaLabel is unset.
    renderWithIntl(
      <IconCardsLayout
        data={makeData({ showWhatsapp: true })}
        business={makeBusiness()}
        {...commonProps}
        cardBg="#fff"
      />,
    );

    expect(screen.getByRole('link', { name: 'Chamar no WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/11987654321',
    );
  });

  it('renders no phone row when business.phone is null even if showPhone is true', () => {
    renderWithIntl(
      <IconCardsLayout
        data={makeData()}
        business={makeBusiness({ phone: null })}
        {...commonProps}
        cardBg="#fff"
      />,
    );

    expect(screen.queryByText('11987654321')).not.toBeInTheDocument();
  });
});
