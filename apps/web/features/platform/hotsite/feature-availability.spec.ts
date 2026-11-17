import { describe, expect, it } from 'vitest';
import type { FeatureKey, HotsiteManifestResponse, HotsiteModuleResponse } from '@ikaro/types';
import { isFeatureAvailable, withoutLinksToUnavailableSections } from './feature-availability';

function manifest(
  layout: HotsiteModuleResponse[],
  unavailableFeatures?: FeatureKey[],
): HotsiteManifestResponse {
  return { layout, unavailableFeatures } as HotsiteManifestResponse;
}

const NAVIGATION_BOOKING_CTA: HotsiteModuleResponse = {
  type: 'NAVIGATION',
  enabled: true,
  data: {
    items: [{ label: 'Home', target: 'home' }],
    cta: { label: 'Agendar', target: 'booking-form' },
  },
};
const NAVIGATION_LEAD_CTA: HotsiteModuleResponse = {
  type: 'NAVIGATION',
  enabled: true,
  data: { items: [], cta: { label: 'Fale conosco', target: 'lead-form' } },
};
const HERO_BOOKING: HotsiteModuleResponse = {
  type: 'HERO',
  enabled: true,
  data: {
    variant: 'centered',
    title: 'T',
    ctaLabel: 'Agendar',
    ctaTarget: 'booking-form',
    secondaryCtaLabel: 'Serviços',
    secondaryCtaTarget: 'service-list',
  },
};
const HERO_ABOUT: HotsiteModuleResponse = {
  type: 'HERO',
  enabled: true,
  data: { variant: 'centered', title: 'T', ctaLabel: 'Sobre', ctaTarget: 'about' },
};
const BLOCK_SERVICES: HotsiteModuleResponse = {
  type: 'CONTENT_BLOCK',
  enabled: true,
  data: { variant: 'text', body: 'x', cta: { label: 'Ver', target: 'service-list' } },
};
const BLOCK_CONTACT: HotsiteModuleResponse = {
  type: 'CONTENT_BLOCK',
  enabled: true,
  data: { variant: 'text', body: 'x', cta: { label: 'Contato', target: 'contact' } },
};

describe('isFeatureAvailable', () => {
  it('is false only for a feature the manifest lists as unavailable', () => {
    expect(isFeatureAvailable(manifest([], ['BOOKING']), 'BOOKING')).toBe(false);
    expect(isFeatureAvailable(manifest([], ['BOOKING']), 'LEAD_FORM')).toBe(true);
  });

  it.each([undefined, []])('is true for every feature when the list is %j', (unavailable) => {
    expect(isFeatureAvailable(manifest([], unavailable), 'BOOKING')).toBe(true);
  });
});

describe('withoutLinksToUnavailableSections', () => {
  it('returns the very same manifest when nothing is unavailable', () => {
    const none = manifest([NAVIGATION_BOOKING_CTA, HERO_BOOKING, BLOCK_SERVICES]);
    const empty = manifest([NAVIGATION_BOOKING_CTA, HERO_BOOKING], []);

    expect(withoutLinksToUnavailableSections(none)).toBe(none);
    expect(withoutLinksToUnavailableSections(empty)).toBe(empty);
  });

  it('drops a navigation button that leads to a section whose feature is unavailable', () => {
    const [nav] = withoutLinksToUnavailableSections(
      manifest([NAVIGATION_BOOKING_CTA], ['BOOKING']),
    ).layout;

    expect(nav.data).toEqual({ items: [{ label: 'Home', target: 'home' }] });
  });

  it('works the same for any gated section: the lead form button goes when LEAD_FORM is unavailable', () => {
    const [nav] = withoutLinksToUnavailableSections(
      manifest([NAVIGATION_LEAD_CTA], ['LEAD_FORM']),
    ).layout;

    expect(nav.data).toEqual({ items: [] });
  });

  it('keeps a button whose section needs a feature that is available', () => {
    const input = manifest([NAVIGATION_LEAD_CTA], ['BOOKING']);

    expect(withoutLinksToUnavailableSections(input).layout[0]).toBe(NAVIGATION_LEAD_CTA);
  });

  it('empties the hero primary button and removes the secondary one that lead to unavailable sections', () => {
    const [hero] = withoutLinksToUnavailableSections(manifest([HERO_BOOKING], ['BOOKING'])).layout;

    expect(hero.data).toEqual({
      variant: 'centered',
      title: 'T',
      ctaLabel: '',
      ctaTarget: 'booking-form',
    });
  });

  it('keeps a hero whose buttons lead to sections that carry no feature', () => {
    const input = manifest([HERO_ABOUT], ['BOOKING']);

    expect(withoutLinksToUnavailableSections(input).layout[0]).toBe(HERO_ABOUT);
  });

  it('removes only the content block button that leads to an unavailable section', () => {
    const [services, contact] = withoutLinksToUnavailableSections(
      manifest([BLOCK_SERVICES, BLOCK_CONTACT], ['BOOKING']),
    ).layout;

    expect(services.data).toEqual({ variant: 'text', body: 'x' });
    expect(contact).toBe(BLOCK_CONTACT);
  });

  it('does not mutate the manifest it was given', () => {
    const input = manifest([NAVIGATION_BOOKING_CTA, HERO_BOOKING, BLOCK_SERVICES], ['BOOKING']);
    const snapshot = JSON.stringify(input);

    withoutLinksToUnavailableSections(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
