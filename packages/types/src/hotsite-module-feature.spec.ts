import { HOTSITE_MODULE_FEATURE, type HotsiteModuleType } from './enums';

describe('HOTSITE_MODULE_FEATURE', () => {
  it('gates the modules that read from another feature: the service list and the booking call to action by BOOKING, the lead form and the chatbot by their own', () => {
    expect(HOTSITE_MODULE_FEATURE).toEqual({
      SERVICE_LIST: 'BOOKING',
      BOOKING_CTA: 'BOOKING',
      LEAD_FORM: 'LEAD_FORM',
      CHATBOT: 'CHATBOT',
    });
  });

  it.each<HotsiteModuleType>([
    'NAVIGATION',
    'HERO',
    'GALLERY',
    'TESTIMONIALS',
    'ABOUT',
    'CONTENT_BLOCK',
    'CONTACT',
    'FOOTER',
  ])('leaves %s ungated: it rides on the page HOTSITE feature', (type) => {
    expect(HOTSITE_MODULE_FEATURE[type]).toBeUndefined();
  });
});
