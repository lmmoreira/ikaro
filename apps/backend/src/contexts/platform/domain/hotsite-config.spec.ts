import { HotsiteConfigBuilder } from '../../../test/builders/platform';
import { PlatformDomainError } from './errors/platform-domain.error';
import {
  DEFAULT_HOTSITE_BRANDING,
  HotsiteBranding,
  HotsiteModule,
} from './hotsite-config.aggregate';

const VALID_LAYOUT: HotsiteModule[] = [
  {
    type: 'HERO',
    enabled: true,
    data: {
      variant: 'centered',
      title: 'Bem-vindo',
      ctaLabel: 'Agendar agora',
      ctaTarget: 'booking',
    },
  },
  {
    type: 'BOOKING_CTA',
    enabled: false,
    data: { title: 'Agende já', ctaLabel: 'Agendar' },
  },
];

describe('HotsiteConfig', () => {
  describe('create()', () => {
    it('creates an unpublished config with empty layout and default branding', () => {
      const config = new HotsiteConfigBuilder().build();
      expect(config.tenantId).toBe('01234567-0000-7000-8000-000000000001');
      expect(config.isPublished).toBe(false);
      expect(config.layout).toHaveLength(0);
      expect(config.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(config.branding).toEqual(DEFAULT_HOTSITE_BRANDING);
    });
  });

  describe('publish()', () => {
    it('sets isPublished to true when at least one module is enabled', () => {
      const config = new HotsiteConfigBuilder().buildWithContent(undefined, VALID_LAYOUT);
      config.publish();
      expect(config.isPublished).toBe(true);
    });

    it('throws when layout is empty', () => {
      const config = new HotsiteConfigBuilder().build();
      expect(() => config.publish()).toThrow(PlatformDomainError);
    });

    it('throws when no module is enabled', () => {
      const config = new HotsiteConfigBuilder().buildWithContent(undefined, [
        { ...VALID_LAYOUT[0], enabled: false },
      ]);
      expect(() => config.publish()).toThrow(PlatformDomainError);
    });
  });

  describe('unpublish()', () => {
    it('sets isPublished to false', () => {
      const config = new HotsiteConfigBuilder().buildWithContent(undefined, VALID_LAYOUT);
      config.publish();
      config.unpublish();
      expect(config.isPublished).toBe(false);
    });
  });

  describe('updateContent()', () => {
    it('updates branding and layout', () => {
      const config = new HotsiteConfigBuilder().build();
      config.updateContent(DEFAULT_HOTSITE_BRANDING, VALID_LAYOUT);
      expect(config.branding.primaryColor).toBe(DEFAULT_HOTSITE_BRANDING.primaryColor);
      expect(config.layout).toHaveLength(2);
    });

    it.each(['primaryColor', 'secondaryColor', 'backgroundColor', 'textColor'] as const)(
      'throws for invalid %s hex value',
      (field) => {
        const config = new HotsiteConfigBuilder().build();
        const branding: HotsiteBranding = { ...DEFAULT_HOTSITE_BRANDING, [field]: 'red' };
        expect(() => config.updateContent(branding, VALID_LAYOUT)).toThrow(PlatformDomainError);
      },
    );

    it.each(['borderRadius', 'buttonStyle', 'spacing', 'shadowStyle'] as const)(
      'throws for invalid %s value',
      (field) => {
        const config = new HotsiteConfigBuilder().build();
        const branding = {
          ...DEFAULT_HOTSITE_BRANDING,
          [field]: 'not-a-real-value',
        } as unknown as HotsiteBranding;
        expect(() => config.updateContent(branding, VALID_LAYOUT)).toThrow(PlatformDomainError);
      },
    );

    it.each(['buttonBackgroundColor', 'buttonTextColor'] as const)(
      'throws for an invalid %s hex value when present',
      (field) => {
        const config = new HotsiteConfigBuilder().build();
        const branding: HotsiteBranding = { ...DEFAULT_HOTSITE_BRANDING, [field]: 'red' };
        expect(() => config.updateContent(branding, VALID_LAYOUT)).toThrow(PlatformDomainError);
      },
    );

    it.each(['buttonBackgroundColor', 'buttonTextColor'] as const)(
      'accepts a valid %s hex value',
      (field) => {
        const config = new HotsiteConfigBuilder().build();
        const branding: HotsiteBranding = { ...DEFAULT_HOTSITE_BRANDING, [field]: '#FBBF24' };
        config.updateContent(branding, VALID_LAYOUT);
        expect(config.branding[field]).toBe('#FBBF24');
      },
    );

    it('does not require buttonBackgroundColor/buttonTextColor to be present', () => {
      const config = new HotsiteConfigBuilder().build();
      expect(() => config.updateContent(DEFAULT_HOTSITE_BRANDING, VALID_LAYOUT)).not.toThrow();
    });

    it('throws for an unknown module type', () => {
      const config = new HotsiteConfigBuilder().build();
      const layout = [{ ...VALID_LAYOUT[0], type: 'UNKNOWN' }] as unknown as HotsiteModule[];
      expect(() => config.updateContent(DEFAULT_HOTSITE_BRANDING, layout)).toThrow(
        PlatformDomainError,
      );
    });
  });
});
