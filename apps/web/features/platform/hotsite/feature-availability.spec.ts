import { describe, expect, it } from 'vitest';
import type { FeatureKey, HotsiteManifestResponse, HotsiteModuleResponse } from '@ikaro/types';
import {
  HOTSITE_PAGE_FEATURE,
  isFeatureAvailable,
  isHotsitePageAvailable,
  withoutLinksToUnavailableSections,
} from './feature-availability';

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

describe('isHotsitePageAvailable', () => {
  const pageManifest = (isPublished: boolean, unavailable?: FeatureKey[]) =>
    ({ isPublished, unavailableFeatures: unavailable }) as HotsiteManifestResponse;

  // The expression every page wrote by hand before the registry: the truth table proves the
  // predicate is the very same decision for every state a manifest can be in.
  const previously = (manifestIn: HotsiteManifestResponse) =>
    manifestIn.isPublished && isFeatureAvailable(manifestIn, 'BOOKING');

  it.each([
    ['published, nothing unavailable', pageManifest(true, [])],
    ['published, no answer about features', pageManifest(true, undefined)],
    ['published, BOOKING unavailable', pageManifest(true, ['BOOKING'])],
    ['published, another feature unavailable', pageManifest(true, ['LEAD_FORM', 'CHATBOT'])],
    ['unpublished, nothing unavailable', pageManifest(false, [])],
    ['unpublished, BOOKING unavailable', pageManifest(false, ['BOOKING'])],
  ])('decides %s exactly as the hand-written expression did', (_state, manifestIn) => {
    for (const page of Object.keys(HOTSITE_PAGE_FEATURE) as (keyof typeof HOTSITE_PAGE_FEATURE)[]) {
      expect(isHotsitePageAvailable(manifestIn, page)).toBe(previously(manifestIn));
    }
  });

  it('opens a page only for a published hotsite whose page feature is available', () => {
    expect(isHotsitePageAvailable(pageManifest(true, []), 'booking')).toBe(true);
    expect(isHotsitePageAvailable(pageManifest(true, ['BOOKING']), 'booking')).toBe(false);
    expect(isHotsitePageAvailable(pageManifest(false, []), 'booking')).toBe(false);
  });

  it('is unaffected by a feature the page does not need', () => {
    expect(
      isHotsitePageAvailable(pageManifest(true, ['LEAD_FORM']), 'booking/availability-alert'),
    ).toBe(true);
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

  // Negative guarantees. `home` maps to no section (null in the shared map), which must read as
  // "needs no feature", never as "needs a feature that is unavailable".
  it('keeps a button aimed at home, which leads to no section, whatever is unavailable', () => {
    const block: HotsiteModuleResponse = {
      type: 'CONTENT_BLOCK',
      enabled: true,
      data: { variant: 'text', body: 'x', cta: { label: 'Início', target: 'home' } },
    };
    const input = manifest([block], ['BOOKING', 'LEAD_FORM', 'CHATBOT']);

    expect(withoutLinksToUnavailableSections(input).layout[0]).toBe(block);
  });

  // The manifest carries an arbitrary string: only an own key of the shared map is a target, so a
  // value such as `constructor` is not one and its button is kept.
  it.each(['nope', 'constructor', '__proto__', 'toString', ''])(
    'keeps a button whose target "%s" is not a link target',
    (target) => {
      const block: HotsiteModuleResponse = {
        type: 'CONTENT_BLOCK',
        enabled: true,
        data: { variant: 'text', body: 'x', cta: { label: 'Go', target } },
      };
      const input = manifest([block], ['BOOKING', 'LEAD_FORM', 'CHATBOT']);

      expect(withoutLinksToUnavailableSections(input).layout[0]).toBe(block);
    },
  );

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
