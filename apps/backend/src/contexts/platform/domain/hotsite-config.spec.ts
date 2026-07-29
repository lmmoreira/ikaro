import { HotsiteConfigBuilder } from '../../../test/builders/platform';
import {
  HotsiteCarouselDaysExceedsMaxAdvanceError,
  PlatformDomainError,
} from './errors/platform-domain.error';
import {
  DEFAULT_HOTSITE_BRANDING,
  DEFAULT_HOTSITE_SEO,
  HotsiteBranding,
  HotsiteConfig,
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
      ctaTarget: 'booking-form',
    },
  },
  {
    type: 'BOOKING_CTA',
    enabled: false,
    data: { title: 'Agende já', ctaLabel: 'Agendar' },
  },
];

const CTX = { maxBookingAdvanceDays: 90 };

describe('HotsiteConfig', () => {
  describe('create()', () => {
    it('creates an unpublished config with empty layout and default branding', () => {
      const config = new HotsiteConfigBuilder().build();
      expect(config.tenantId).toBe('01234567-0000-7000-8000-000000000001');
      expect(config.isPublished).toBe(false);
      expect(config.layout).toHaveLength(0);
      expect(config.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(config.branding).toEqual(DEFAULT_HOTSITE_BRANDING);
      expect(config.seo).toEqual(DEFAULT_HOTSITE_SEO);
    });
  });

  describe('reconstitute()', () => {
    // M18-S03: existing rows persisted before ogImageUrl existed store a `seo` jsonb blob with no
    // ogImageUrl key at all — reading one back must not surface `undefined` where the type says
    // `string` (that would crash apps/web's extractRawStoragePath, which calls .indexOf() on it).
    it('defaults ogImageUrl to an empty string when reading a pre-existing row missing the key', () => {
      const legacySeo = { title: null, description: null } as unknown as {
        title: string | null;
        description: string | null;
        ogImageUrl: string;
      };
      const config = HotsiteConfig.reconstitute({
        id: '01234567-0000-7000-8000-000000000099',
        tenantId: '01234567-0000-7000-8000-000000000001',
        branding: DEFAULT_HOTSITE_BRANDING,
        layout: VALID_LAYOUT,
        seo: legacySeo,
        isPublished: false,
        updatedAt: new Date(),
      });

      expect(config.seo.ogImageUrl).toBe('');
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
      config.updateContent(DEFAULT_HOTSITE_BRANDING, VALID_LAYOUT, DEFAULT_HOTSITE_SEO, CTX);
      expect(config.branding.primaryColor).toBe(DEFAULT_HOTSITE_BRANDING.primaryColor);
      expect(config.layout).toHaveLength(2);
    });

    it.each(['primaryColor', 'secondaryColor', 'backgroundColor', 'textColor'] as const)(
      'throws for invalid %s hex value',
      (field) => {
        const config = new HotsiteConfigBuilder().build();
        const branding: HotsiteBranding = { ...DEFAULT_HOTSITE_BRANDING, [field]: 'red' };
        expect(() =>
          config.updateContent(branding, VALID_LAYOUT, DEFAULT_HOTSITE_SEO, CTX),
        ).toThrow(PlatformDomainError);
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
        expect(() =>
          config.updateContent(branding, VALID_LAYOUT, DEFAULT_HOTSITE_SEO, CTX),
        ).toThrow(PlatformDomainError);
      },
    );

    it.each(['buttonBackgroundColor', 'buttonTextColor'] as const)(
      'throws for an invalid %s hex value when present',
      (field) => {
        const config = new HotsiteConfigBuilder().build();
        const branding: HotsiteBranding = { ...DEFAULT_HOTSITE_BRANDING, [field]: 'red' };
        expect(() =>
          config.updateContent(branding, VALID_LAYOUT, DEFAULT_HOTSITE_SEO, CTX),
        ).toThrow(PlatformDomainError);
      },
    );

    it.each(['buttonBackgroundColor', 'buttonTextColor'] as const)(
      'accepts a valid %s hex value',
      (field) => {
        const config = new HotsiteConfigBuilder().build();
        const branding: HotsiteBranding = { ...DEFAULT_HOTSITE_BRANDING, [field]: '#FBBF24' };
        config.updateContent(branding, VALID_LAYOUT, DEFAULT_HOTSITE_SEO, CTX);
        expect(config.branding[field]).toBe('#FBBF24');
      },
    );

    it('does not require buttonBackgroundColor/buttonTextColor to be present', () => {
      const config = new HotsiteConfigBuilder().build();
      expect(() =>
        config.updateContent(DEFAULT_HOTSITE_BRANDING, VALID_LAYOUT, DEFAULT_HOTSITE_SEO, CTX),
      ).not.toThrow();
    });

    it('throws for an unknown module type', () => {
      const config = new HotsiteConfigBuilder().build();
      const layout = [{ ...VALID_LAYOUT[0], type: 'UNKNOWN' }] as unknown as HotsiteModule[];
      expect(() =>
        config.updateContent(DEFAULT_HOTSITE_BRANDING, layout, DEFAULT_HOTSITE_SEO, CTX),
      ).toThrow(PlatformDomainError);
    });

    it('defaults seo to null title and description when not provided', () => {
      const config = new HotsiteConfigBuilder().build();
      config.updateContent(DEFAULT_HOTSITE_BRANDING, VALID_LAYOUT, DEFAULT_HOTSITE_SEO, CTX);
      expect(config.seo).toEqual(DEFAULT_HOTSITE_SEO);
    });

    it('sets seo title and description', () => {
      const config = new HotsiteConfigBuilder().build();
      config.updateContent(
        DEFAULT_HOTSITE_BRANDING,
        VALID_LAYOUT,
        {
          title: 'Lavacar Estrela — Agendamento Online',
          description: 'Agende sua lavagem rápido e fácil.',
          ogImageUrl: '',
        },
        CTX,
      );
      expect(config.seo).toEqual({
        title: 'Lavacar Estrela — Agendamento Online',
        description: 'Agende sua lavagem rápido e fácil.',
        ogImageUrl: '',
      });
    });

    it('throws when seo.title exceeds 60 characters', () => {
      const config = new HotsiteConfigBuilder().build();
      const title = 'a'.repeat(61);
      expect(() =>
        config.updateContent(
          DEFAULT_HOTSITE_BRANDING,
          VALID_LAYOUT,
          { title, description: null, ogImageUrl: '' },
          CTX,
        ),
      ).toThrow(PlatformDomainError);
    });

    it('throws when seo.description exceeds 158 characters', () => {
      const config = new HotsiteConfigBuilder().build();
      const description = 'a'.repeat(159);
      expect(() =>
        config.updateContent(
          DEFAULT_HOTSITE_BRANDING,
          VALID_LAYOUT,
          {
            title: null,
            description,
            ogImageUrl: '',
          },
          CTX,
        ),
      ).toThrow(PlatformDomainError);
    });

    it('accepts seo.title at exactly 60 characters', () => {
      const config = new HotsiteConfigBuilder().build();
      const title = 'a'.repeat(60);
      config.updateContent(
        DEFAULT_HOTSITE_BRANDING,
        VALID_LAYOUT,
        { title, description: null, ogImageUrl: '' },
        CTX,
      );
      expect(config.seo.title).toBe(title);
    });

    it('accepts seo.description at exactly 158 characters', () => {
      const config = new HotsiteConfigBuilder().build();
      const description = 'a'.repeat(158);
      config.updateContent(
        DEFAULT_HOTSITE_BRANDING,
        VALID_LAYOUT,
        { title: null, description, ogImageUrl: '' },
        CTX,
      );
      expect(config.seo.description).toBe(description);
    });

    // Regression test: a tenant reconstituted from a stored row can carry a seo.title/description
    // that was valid under a since-tightened limit (e.g. saved under the pre-M13-S37 70-char
    // limit, now exceeding the current 60). Passing that unchanged value through on a
    // branding/layout-only update must not throw, or every future update for that tenant breaks
    // until someone manually shortens its SEO — see hotsite-config.aggregate.ts's updateContent().
    it('does not re-validate seo.title when it is unchanged, even if it exceeds the current 60-char limit', () => {
      const legacyTitle = 'a'.repeat(65);
      const config = HotsiteConfig.reconstitute({
        id: '01234567-0000-7000-8000-000000000099',
        tenantId: '01234567-0000-7000-8000-000000000001',
        branding: DEFAULT_HOTSITE_BRANDING,
        layout: VALID_LAYOUT,
        seo: { title: legacyTitle, description: null, ogImageUrl: '' },
        isPublished: false,
        updatedAt: new Date(),
      });

      expect(() =>
        config.updateContent(
          DEFAULT_HOTSITE_BRANDING,
          VALID_LAYOUT,
          {
            title: legacyTitle,
            description: null,
            ogImageUrl: '',
          },
          CTX,
        ),
      ).not.toThrow();
      expect(config.seo.title).toBe(legacyTitle);
    });

    it('still validates seo.title when the admin actually changes it, even from a legacy value', () => {
      const config = HotsiteConfig.reconstitute({
        id: '01234567-0000-7000-8000-000000000099',
        tenantId: '01234567-0000-7000-8000-000000000001',
        branding: DEFAULT_HOTSITE_BRANDING,
        layout: VALID_LAYOUT,
        seo: { title: 'a'.repeat(65), description: null, ogImageUrl: '' },
        isPublished: false,
        updatedAt: new Date(),
      });

      expect(() =>
        config.updateContent(
          DEFAULT_HOTSITE_BRANDING,
          VALID_LAYOUT,
          {
            title: 'a'.repeat(61),
            description: null,
            ogImageUrl: '',
          },
          CTX,
        ),
      ).toThrow(PlatformDomainError);
    });

    // Regression (M18-S03): seoEquals() must compare ogImageUrl too, or updateContent()'s
    // "skip re-validating/storing seo when unchanged" optimization would also skip *storing* a
    // seo update where only ogImageUrl actually changed (title/description identical) — silently
    // dropping the new value.
    it('updates seo.ogImageUrl even when title and description are unchanged', () => {
      const config = HotsiteConfig.reconstitute({
        id: '01234567-0000-7000-8000-000000000099',
        tenantId: '01234567-0000-7000-8000-000000000001',
        branding: DEFAULT_HOTSITE_BRANDING,
        layout: VALID_LAYOUT,
        seo: { title: 'Título', description: null, ogImageUrl: '' },
        isPublished: false,
        updatedAt: new Date(),
      });

      config.updateContent(
        DEFAULT_HOTSITE_BRANDING,
        VALID_LAYOUT,
        {
          title: 'Título',
          description: null,
          ogImageUrl: 'tenants/tenant-1/hotsite/seo-og-image/share.png',
        },
        CTX,
      );

      expect(config.seo.ogImageUrl).toBe('tenants/tenant-1/hotsite/seo-og-image/share.png');
    });

    describe('BOOKING_CTA carouselDays vs. maxBookingAdvanceDays', () => {
      function layoutWithCarouselDays(carouselDays: number | undefined): HotsiteModule[] {
        return [
          {
            type: 'BOOKING_CTA',
            enabled: true,
            data: { title: 'Agende já', ctaLabel: 'Agendar', carouselDays },
          },
        ];
      }

      it('throws HotsiteCarouselDaysExceedsMaxAdvanceError when carouselDays exceeds maxBookingAdvanceDays', () => {
        const config = new HotsiteConfigBuilder().build();
        const layout = layoutWithCarouselDays(91);
        expect(() =>
          config.updateContent(DEFAULT_HOTSITE_BRANDING, layout, DEFAULT_HOTSITE_SEO, {
            maxBookingAdvanceDays: 90,
          }),
        ).toThrow(HotsiteCarouselDaysExceedsMaxAdvanceError);
      });

      it('does not throw when carouselDays is within maxBookingAdvanceDays', () => {
        const config = new HotsiteConfigBuilder().build();
        const layout = layoutWithCarouselDays(90);
        expect(() =>
          config.updateContent(DEFAULT_HOTSITE_BRANDING, layout, DEFAULT_HOTSITE_SEO, {
            maxBookingAdvanceDays: 90,
          }),
        ).not.toThrow();
      });

      it('does not throw when carouselDays is undefined', () => {
        const config = new HotsiteConfigBuilder().build();
        const layout = layoutWithCarouselDays(undefined);
        expect(() =>
          config.updateContent(DEFAULT_HOTSITE_BRANDING, layout, DEFAULT_HOTSITE_SEO, {
            maxBookingAdvanceDays: 90,
          }),
        ).not.toThrow();
      });

      it('does not throw when carouselDays exceeds the limit but datePickerType is calendar (stale, inert value)', () => {
        const config = new HotsiteConfigBuilder().build();
        const layout: HotsiteModule[] = [
          {
            type: 'BOOKING_CTA',
            enabled: true,
            data: {
              title: 'Agende já',
              ctaLabel: 'Agendar',
              carouselDays: 91,
              datePickerType: 'calendar',
            },
          },
        ];
        expect(() =>
          config.updateContent(DEFAULT_HOTSITE_BRANDING, layout, DEFAULT_HOTSITE_SEO, {
            maxBookingAdvanceDays: 90,
          }),
        ).not.toThrow();
      });

      it('still throws when carouselDays exceeds the limit and datePickerType is explicitly carousel', () => {
        const config = new HotsiteConfigBuilder().build();
        const layout: HotsiteModule[] = [
          {
            type: 'BOOKING_CTA',
            enabled: true,
            data: {
              title: 'Agende já',
              ctaLabel: 'Agendar',
              carouselDays: 91,
              datePickerType: 'carousel',
            },
          },
        ];
        expect(() =>
          config.updateContent(DEFAULT_HOTSITE_BRANDING, layout, DEFAULT_HOTSITE_SEO, {
            maxBookingAdvanceDays: 90,
          }),
        ).toThrow(HotsiteCarouselDaysExceedsMaxAdvanceError);
      });

      it('does not throw for a non-BOOKING_CTA module even with an oversized carouselDays-shaped field', () => {
        const config = new HotsiteConfigBuilder().build();
        const layout: HotsiteModule[] = [
          {
            type: 'HERO',
            enabled: true,
            data: {
              variant: 'centered',
              title: 'Bem-vindo',
              ctaLabel: 'Agendar agora',
              ctaTarget: 'booking-form',
              carouselDays: 9999,
            } as never,
          },
        ];
        expect(() =>
          config.updateContent(DEFAULT_HOTSITE_BRANDING, layout, DEFAULT_HOTSITE_SEO, {
            maxBookingAdvanceDays: 90,
          }),
        ).not.toThrow();
      });
    });
  });
});
