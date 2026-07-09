import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import { GenerateHotsiteImageReadSignedUrlUseCase } from './generate-hotsite-image-read-signed-url.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GenerateHotsiteImageReadSignedUrlUseCase', () => {
  let storageService: InMemoryStorageService;
  let useCase: GenerateHotsiteImageReadSignedUrlUseCase;

  beforeEach(() => {
    storageService = new InMemoryStorageService();
    useCase = new GenerateHotsiteImageReadSignedUrlUseCase(storageService);
  });

  it('returns a signedUrl and expiresAt for a tenant-owned tmp/ path', async () => {
    const filePath = `tmp/${TENANT_A}/branding/u1/logo.png`;

    const result = await useCase.execute({ tenantId: TENANT_A, filePath });

    expect(result.signedUrl).toContain(filePath);
    expect(result.expiresAt).toBe('2099-01-01T00:00:00.000Z');
  });

  it('tenant isolation: rejects a tmp/ path belonging to another tenant', async () => {
    const filePath = `tmp/${TENANT_B}/branding/u1/logo.png`;

    await expect(useCase.execute({ tenantId: TENANT_A, filePath })).rejects.toBeInstanceOf(
      HotsiteImageNotUploadedError,
    );
  });
});
