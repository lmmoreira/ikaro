import { HotsiteConfig, LayoutModule } from './hotsite-config.aggregate';
import { PlatformDomainError } from './errors/platform-domain.error';

const TENANT_ID = '01234567-0000-7000-8000-000000000001';

const modules: LayoutModule[] = [
  { type: 'HERO', order: 0 },
  { type: 'BOOKING_CTA', order: 1 },
];

describe('HotsiteConfig', () => {
  describe('create()', () => {
    it('creates an unpublished config with empty layout', () => {
      const config = HotsiteConfig.create(TENANT_ID);
      expect(config.tenantId).toBe(TENANT_ID);
      expect(config.isPublished).toBe(false);
      expect(config.layout).toHaveLength(0);
      expect(config.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('publish()', () => {
    it('sets isPublished to true after content is added', () => {
      const config = HotsiteConfig.create(TENANT_ID);
      config.updateContent({ primaryColor: '#FF5733' }, modules);
      config.publish();
      expect(config.isPublished).toBe(true);
    });

    it('throws when layout is empty', () => {
      const config = HotsiteConfig.create(TENANT_ID);
      expect(() => config.publish()).toThrow(PlatformDomainError);
    });
  });

  describe('unpublish()', () => {
    it('sets isPublished to false', () => {
      const config = HotsiteConfig.create(TENANT_ID);
      config.updateContent({ primaryColor: '#FF5733' }, modules);
      config.publish();
      config.unpublish();
      expect(config.isPublished).toBe(false);
    });
  });

  describe('updateContent()', () => {
    it('updates branding and layout', () => {
      const config = HotsiteConfig.create(TENANT_ID);
      config.updateContent(
        { primaryColor: '#123456', logoUrl: 'https://example.com/logo.png' },
        modules,
      );
      expect(config.branding.primaryColor).toBe('#123456');
      expect(config.layout).toHaveLength(2);
    });

    it('throws for invalid hex color', () => {
      const config = HotsiteConfig.create(TENANT_ID);
      expect(() => config.updateContent({ primaryColor: 'red' }, modules)).toThrow(
        PlatformDomainError,
      );
    });

    it('accepts branding without primaryColor', () => {
      const config = HotsiteConfig.create(TENANT_ID);
      expect(() =>
        config.updateContent({ logoUrl: 'https://example.com/logo.png' }, modules),
      ).not.toThrow();
    });
  });
});
