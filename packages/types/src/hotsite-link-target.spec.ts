import { HOTSITE_LINK_TARGET_MODULE, NAVIGATION_CTA_REQUIRED_MODULE } from './hotsite';
import { HotsiteCtaTargetSchema, NavigationModuleDataSchema } from './hotsite-schemas';
import { HOTSITE_MODULE_FEATURE, type HotsiteModuleType } from './enums';

// The key sets are pinned against the runtime sources of truth (the Zod enums the request boundary
// validates with), so a target added to a schema without a map entry fails here even where the type
// union does not reach it.
const navigationItemTargets = NavigationModuleDataSchema.shape.items.element.shape.target.options;
const navigationCtaTargets = NavigationModuleDataSchema.shape.cta.unwrap().shape.target.options;

const MODULE_TYPES: readonly HotsiteModuleType[] = [
  'NAVIGATION',
  'HERO',
  'SERVICE_LIST',
  'GALLERY',
  'TESTIMONIALS',
  'BOOKING_CTA',
  'ABOUT',
  'CONTENT_BLOCK',
  'CONTACT',
  'FOOTER',
  'CHATBOT',
  'LEAD_FORM',
];

describe('HOTSITE_LINK_TARGET_MODULE', () => {
  it('has a key for every target a hero, a content-block, a navigation item or the header button can have', () => {
    const expected = new Set<string>([
      ...HotsiteCtaTargetSchema.options,
      ...navigationItemTargets,
      ...navigationCtaTargets,
    ]);

    expect(new Set(Object.keys(HOTSITE_LINK_TARGET_MODULE))).toEqual(expected);
  });

  it('names a real module type for every target that leads to a section', () => {
    const sections = Object.values(HOTSITE_LINK_TARGET_MODULE).filter((type) => type !== null);

    expect(sections.length).toBeGreaterThan(0);
    for (const type of sections) expect(MODULE_TYPES).toContain(type);
  });

  it('maps home, the hotsite root, to no section: it is the only target without one', () => {
    const withoutSection = Object.entries(HOTSITE_LINK_TARGET_MODULE)
      .filter(([, type]) => type === null)
      .map(([target]) => target);

    expect(withoutSection).toEqual(['home']);
  });

  it('leads the booking button to BOOKING_CTA and the lead-form button to LEAD_FORM, the sections their features gate', () => {
    expect(HOTSITE_LINK_TARGET_MODULE['booking-form']).toBe('BOOKING_CTA');
    expect(HOTSITE_LINK_TARGET_MODULE['lead-form']).toBe('LEAD_FORM');
    expect(HOTSITE_MODULE_FEATURE.BOOKING_CTA).toBe('BOOKING');
    expect(HOTSITE_MODULE_FEATURE.LEAD_FORM).toBe('LEAD_FORM');
  });
});

describe('NAVIGATION_CTA_REQUIRED_MODULE', () => {
  it('has a key for every target the header button can have', () => {
    expect(new Set(Object.keys(NAVIGATION_CTA_REQUIRED_MODULE))).toEqual(
      new Set<string>(navigationCtaTargets),
    );
  });

  it('requires an enabled LEAD_FORM for the lead-form button and no module for the booking button', () => {
    expect(NAVIGATION_CTA_REQUIRED_MODULE).toEqual({
      'booking-form': null,
      'lead-form': 'LEAD_FORM',
    });
  });

  it('is a different question from the link map: the booking button leads to BOOKING_CTA yet needs it enabled never', () => {
    expect(HOTSITE_LINK_TARGET_MODULE['booking-form']).not.toBeNull();
    expect(NAVIGATION_CTA_REQUIRED_MODULE['booking-form']).toBeNull();
  });
});
