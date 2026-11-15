import { HOTSITE_MODULE_FEATURE, type HotsiteModuleType } from './enums';

describe('HOTSITE_MODULE_FEATURE', () => {
  it('gates exactly the LEAD_FORM and CHATBOT modules, each by the feature of the same name', () => {
    expect(HOTSITE_MODULE_FEATURE).toEqual({ LEAD_FORM: 'LEAD_FORM', CHATBOT: 'CHATBOT' });
  });

  it.each<HotsiteModuleType>([
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
  ])('leaves %s ungated: it rides on the page HOTSITE feature', (type) => {
    expect(HOTSITE_MODULE_FEATURE[type]).toBeUndefined();
  });
});
