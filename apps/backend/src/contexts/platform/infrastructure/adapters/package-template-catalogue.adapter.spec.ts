import { HOTSITE_TEMPLATE_IDS } from '@ikaro/types';
import { UpdateHotsiteContentSchema } from '../../application/dtos/update-hotsite-content.dto';
import {
  DEFAULT_HOTSITE_BRANDING,
  DEFAULT_HOTSITE_SEO,
  HotsiteConfig,
  HotsiteModule,
} from '../../domain/hotsite-config.aggregate';
import { HotsiteImagePathsService } from '../../domain/services/hotsite-image-paths.service';
import { PackageTemplateCatalogueAdapter } from './package-template-catalogue.adapter';

const adapter = new PackageTemplateCatalogueAdapter();
const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };
const LOCALES = ['pt-BR', 'en'] as const;
const TENANT = '10000000-0000-4000-8000-000000000001';

function materialize(id: string, locale: 'pt-BR' | 'en') {
  const result = adapter.materialize(id, locale, IDENTITY);
  if (result === null) throw new Error(`unknown template ${id}`);
  return result;
}

describe('PackageTemplateCatalogueAdapter', () => {
  it('lists the catalogue in picker order with a thumbnail path and derived capabilities', () => {
    const entries = adapter.list();

    expect(entries.map((entry) => entry.id)).toEqual([...HOTSITE_TEMPLATE_IDS]);
    for (const entry of entries) {
      expect(entry.thumbnailPath).toBe(
        `shared/hotsite-templates/${entry.id}/v${entry.version}/thumbnail.webp`,
      );
      expect(adapter.isRegisteredAssetPath(entry.thumbnailPath)).toBe(true);
      expect(entry.capabilities.length).toBeGreaterThan(0);
    }
  });

  it('returns null for an id that is not in the catalogue', () => {
    expect(adapter.materialize('unknown', 'pt-BR', IDENTITY)).toBeNull();
    expect(adapter.materialize('__proto__', 'en', IDENTITY)).toBeNull();
  });

  it("never returns tenant identity from a template: name and tagline stay the caller's", () => {
    const { branding } = materialize('casa47', 'pt-BR');

    expect(branding).not.toHaveProperty('brandName');
    expect(branding).not.toHaveProperty('brandTagline');
    expect(branding).not.toHaveProperty('logoUrl');
  });

  describe.each(HOTSITE_TEMPLATE_IDS)('%s', (id) => {
    it.each(LOCALES)('forms a layout and branding the aggregate accepts in %s', (locale) => {
      const { branding, layout } = materialize(id, locale);
      const config = HotsiteConfig.create(TENANT);

      expect(() =>
        config.updateContent(
          { ...DEFAULT_HOTSITE_BRANDING, ...branding },
          layout,
          DEFAULT_HOTSITE_SEO,
          {
            maxBookingAdvanceDays: 365,
          },
        ),
      ).not.toThrow();
    });

    it.each(LOCALES)('passes the update request schema in %s', (locale) => {
      const { branding, layout } = materialize(id, locale);

      const parsed = UpdateHotsiteContentSchema.safeParse({ branding, layout });

      expect(parsed.success).toBe(true);
    });

    it('references only registered catalogue images, found by the schema-aware walker', () => {
      const { branding, layout } = materialize(id, 'pt-BR');
      const paths = new HotsiteImagePathsService().collect(
        { ...DEFAULT_HOTSITE_BRANDING, ...branding },
        layout,
        DEFAULT_HOTSITE_SEO,
      );

      expect(paths.length).toBeGreaterThan(1);
      for (const path of paths) {
        expect(adapter.isRegisteredAssetPath(path)).toBe(true);
        expect(path.startsWith(`shared/hotsite-templates/${id}/`)).toBe(true);
      }
    });

    it('never carries a tenant path, an absolute URL or a fictional service id', () => {
      const json = JSON.stringify(materialize(id, 'pt-BR'));

      expect(json).not.toContain('tenants/');
      expect(json).not.toMatch(/https?:\/\//);
      expect(json).not.toContain('serviceId');
    });

    it('never offers detail pages a new tenant does not have', () => {
      const serviceList = materialize(id, 'pt-BR').layout.find(
        (module: HotsiteModule) => module.type === 'SERVICE_LIST',
      );

      expect((serviceList?.data as { itemAction?: string }).itemAction).not.toBe('details');
    });
  });

  describe('isRegisteredAssetPath', () => {
    it('accepts an exact released path', () => {
      expect(adapter.isRegisteredAssetPath('shared/hotsite-templates/casa47/v1/hero.webp')).toBe(
        true,
      );
    });

    it('rejects an unregistered path under the shared prefix and the bare prefix', () => {
      expect(adapter.isRegisteredAssetPath('shared/hotsite-templates/casa47/v1/missing.webp')).toBe(
        false,
      );
      expect(adapter.isRegisteredAssetPath('shared/')).toBe(false);
      expect(adapter.isRegisteredAssetPath('shared/hotsite-templates/')).toBe(false);
    });

    it('rejects a tenant path', () => {
      expect(adapter.isRegisteredAssetPath(`tenants/${TENANT}/hotsite/hero/a.webp`)).toBe(false);
    });
  });
});
