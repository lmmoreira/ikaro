import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { GenerateHotsiteImageSignedUrlUseCase } from './generate-hotsite-image-signed-url.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GenerateHotsiteImageSignedUrlUseCase', () => {
  let storageService: InMemoryStorageService;
  let useCase: GenerateHotsiteImageSignedUrlUseCase;

  beforeEach(() => {
    storageService = new InMemoryStorageService();
    useCase = new GenerateHotsiteImageSignedUrlUseCase(storageService);
  });

  it('builds a tmp/ staging filePath scoped to the tenant and the requested purpose', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      fileName: 'logo.png',
      contentType: 'image/png',
      purpose: 'branding',
    });

    expect(result.filePath).toMatch(new RegExp(`^tmp/${TENANT_A}/branding/[0-9a-f-]+/logo\\.png$`));
  });

  it('returns the signedUrl and expiresAt from the storage service', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      fileName: 'hero.jpg',
      contentType: 'image/jpeg',
      purpose: 'hero',
    });

    expect(result.signedUrl).toContain(result.filePath);
    expect(result.expiresAt).toBe('2099-01-01T00:00:00.000Z');
  });

  it('targets the private bucket — not public/permanent until promotion on save', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_A,
      fileName: 'hero.jpg',
      contentType: 'image/jpeg',
      purpose: 'hero',
    });

    expect(result.signedUrl).not.toContain('ikaro-local-public');
  });

  it('scopes the generated path to the requesting tenant', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_B,
      fileName: 'about.png',
      contentType: 'image/png',
      purpose: 'about',
    });

    expect(result.filePath.startsWith(`tmp/${TENANT_B}/about/`)).toBe(true);
  });
});
