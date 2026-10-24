import { HOTSITE_TEMPLATE_CAPABILITIES, HOTSITE_TEMPLATE_IDS } from '@ikaro/types';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { PackageTemplateCatalogueAdapter } from '../../infrastructure/adapters/package-template-catalogue.adapter';
import { ListHotsiteTemplatesUseCase } from './list-hotsite-templates.use-case';

describe('ListHotsiteTemplatesUseCase', () => {
  let storageService: InMemoryStorageService;
  let useCase: ListHotsiteTemplatesUseCase;

  beforeEach(() => {
    storageService = new InMemoryStorageService();
    useCase = new ListHotsiteTemplatesUseCase(
      new PackageTemplateCatalogueAdapter(),
      storageService,
    );
  });

  it('lists the six catalogue templates in picker order', () => {
    expect(useCase.execute().templates.map((template) => template.id)).toEqual([
      ...HOTSITE_TEMPLATE_IDS,
    ]);
  });

  it('exposes only id, version, thumbnail URL and capabilities: no display strings', () => {
    for (const template of useCase.execute().templates) {
      expect(Object.keys(template).sort()).toEqual([
        'capabilities',
        'id',
        'thumbnailUrl',
        'version',
      ]);
    }
  });

  it('resolves the thumbnail to a public URL without touching storage', () => {
    const { templates } = useCase.execute();

    expect(templates[1].thumbnailUrl).toBe(
      'http://fake-public-gcs/ikaro-local-public/shared/hotsite-templates/casa47/v1/thumbnail.webp',
    );
    expect(storageService.existenceChecks).toEqual([]);
    expect(storageService.readSignedPaths).toEqual([]);
  });

  it('derives capabilities from the closed shared token set', () => {
    for (const template of useCase.execute().templates) {
      expect(template.capabilities.length).toBeGreaterThan(0);
      for (const capability of template.capabilities) {
        expect(HOTSITE_TEMPLATE_CAPABILITIES).toContain(capability);
      }
    }
  });
});
