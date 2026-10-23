import { PlatformErrorCode } from '@ikaro/types';
import {
  HotsiteModuleDuplicateError,
  HotsiteNavigationNotFirstError,
  HotsiteNavigationTargetNotEnabledError,
  HotsitePresentationBackgroundNotAllowedError,
  HotsitePresentationNotAllowedError,
} from './errors/platform-domain.error';
import { HotsiteModule, HotsiteModulePresentation } from './hotsite-config.types';
import { assertValidLayoutStructure } from './hotsite-layout.rules';

const navigation = (
  targets: ('service-list' | 'gallery' | 'testimonials' | 'about' | 'contact')[],
  enabled = true,
): HotsiteModule => ({
  type: 'NAVIGATION',
  enabled,
  data: { items: targets.map((target) => ({ label: target, target })) },
});

const hero = (presentation?: HotsiteModulePresentation): HotsiteModule => ({
  type: 'HERO',
  enabled: true,
  data: { variant: 'centered', title: 'T', ctaLabel: 'Go', ctaTarget: 'booking-form' },
  ...(presentation ? { presentation } : {}),
});

const gallery = (enabled = true, presentation?: HotsiteModulePresentation): HotsiteModule => ({
  type: 'GALLERY',
  enabled,
  data: { images: [], layout: 'grid', maxVisible: 6 },
  ...(presentation ? { presentation } : {}),
});

const contact = (enabled = true): HotsiteModule => ({
  type: 'CONTACT',
  enabled,
  data: {
    showAddress: true,
    showPhone: true,
    showWhatsapp: true,
    showEmail: true,
    showMap: true,
  },
});

describe('assertValidLayoutStructure', () => {
  it('accepts a legacy layout with no NAVIGATION and no presentation', () => {
    expect(() => assertValidLayoutStructure([hero(), gallery(), contact()])).not.toThrow();
  });

  it('accepts an empty layout', () => {
    expect(() => assertValidLayoutStructure([])).not.toThrow();
  });

  describe('one entry per module type', () => {
    it('rejects a second entry of the same type with PLATFORM_HOTSITE_MODULE_DUPLICATE', () => {
      const act = () => assertValidLayoutStructure([hero(), gallery(), hero()]);
      expect(act).toThrow(HotsiteModuleDuplicateError);
      expect(act).toThrow(
        expect.objectContaining({ code: PlatformErrorCode.HOTSITE_MODULE_DUPLICATE }),
      );
    });
  });

  describe('NAVIGATION is always first', () => {
    it('accepts NAVIGATION at index 0', () => {
      expect(() =>
        assertValidLayoutStructure([navigation(['gallery']), hero(), gallery()]),
      ).not.toThrow();
    });

    it('rejects NAVIGATION anywhere else with PLATFORM_HOTSITE_NAVIGATION_NOT_FIRST', () => {
      const act = () => assertValidLayoutStructure([hero(), navigation(['gallery']), gallery()]);
      expect(act).toThrow(HotsiteNavigationNotFirstError);
      expect(act).toThrow(
        expect.objectContaining({ code: PlatformErrorCode.HOTSITE_NAVIGATION_NOT_FIRST }),
      );
    });

    it('rejects a disabled NAVIGATION that is not first as well', () => {
      expect(() => assertValidLayoutStructure([hero(), navigation([], false), gallery()])).toThrow(
        HotsiteNavigationNotFirstError,
      );
    });
  });

  describe('navigation targets must be enabled modules', () => {
    it('accepts targets that are all enabled in the same layout', () => {
      expect(() =>
        assertValidLayoutStructure([
          navigation(['gallery', 'contact']),
          hero(),
          gallery(),
          contact(),
        ]),
      ).not.toThrow();
    });

    it('rejects a target whose module is disabled', () => {
      const act = () =>
        assertValidLayoutStructure([navigation(['gallery']), hero(), gallery(false)]);
      expect(act).toThrow(HotsiteNavigationTargetNotEnabledError);
      expect(act).toThrow(
        expect.objectContaining({ code: PlatformErrorCode.HOTSITE_NAVIGATION_TARGET_NOT_ENABLED }),
      );
    });

    it('rejects a target whose module is absent from the layout', () => {
      expect(() => assertValidLayoutStructure([navigation(['about']), hero()])).toThrow(
        HotsiteNavigationTargetNotEnabledError,
      );
    });

    it('does not check the targets of a disabled NAVIGATION', () => {
      expect(() =>
        assertValidLayoutStructure([navigation(['about'], false), hero()]),
      ).not.toThrow();
    });

    it('accepts an enabled NAVIGATION with no items', () => {
      expect(() => assertValidLayoutStructure([navigation([]), hero()])).not.toThrow();
    });
  });

  describe('presentation is only accepted on some module types', () => {
    it.each(['NAVIGATION', 'FOOTER', 'CHATBOT'] as const)('rejects presentation on %s', (type) => {
      const module = {
        type,
        enabled: true,
        data: type === 'NAVIGATION' ? { items: [] } : {},
        presentation: { surface: 'primary' },
      } as HotsiteModule;
      const act = () => assertValidLayoutStructure([module]);
      expect(act).toThrow(HotsitePresentationNotAllowedError);
      expect(act).toThrow(
        expect.objectContaining({ code: PlatformErrorCode.HOTSITE_PRESENTATION_NOT_ALLOWED }),
      );
    });

    it('accepts presentation on a module that supports it', () => {
      expect(() =>
        assertValidLayoutStructure([hero({ surface: 'primary', contentWidth: 'wide' })]),
      ).not.toThrow();
    });
  });

  describe('presentation.background is only accepted where the module has no background of its own', () => {
    const background = { imageUrl: 'tenants/t/hotsite/section-background/a.jpg' };

    it.each(['HERO', 'BOOKING_CTA', 'LEAD_FORM'] as const)(
      'rejects presentation.background on %s',
      (type) => {
        const data =
          type === 'HERO'
            ? { variant: 'centered', title: 'T', ctaLabel: 'Go', ctaTarget: 'booking-form' }
            : { title: 'T', ctaLabel: 'Go' };
        const module = { type, enabled: true, data, presentation: { background } } as HotsiteModule;
        const act = () => assertValidLayoutStructure([module]);
        expect(act).toThrow(HotsitePresentationBackgroundNotAllowedError);
        expect(act).toThrow(
          expect.objectContaining({
            code: PlatformErrorCode.HOTSITE_PRESENTATION_BACKGROUND_NOT_ALLOWED,
          }),
        );
      },
    );

    it('still accepts a HERO presentation without a background, overlay included', () => {
      expect(() =>
        assertValidLayoutStructure([
          hero({ overlay: { type: 'solid', color: '#000000', opacity: 0.4 } }),
        ]),
      ).not.toThrow();
    });

    it('accepts presentation.background on a module with no background of its own', () => {
      expect(() => assertValidLayoutStructure([gallery(true, { background })])).not.toThrow();
    });
  });
});
