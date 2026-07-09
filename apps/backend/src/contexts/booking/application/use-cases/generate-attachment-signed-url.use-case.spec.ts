import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { GenerateAttachmentSignedUrlUseCase } from './generate-attachment-signed-url.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000301';
const TENANT_B = '10000000-0000-4000-8000-000000000302';

describe('GenerateAttachmentSignedUrlUseCase', () => {
  let storageService: InMemoryStorageService;
  let useCase: GenerateAttachmentSignedUrlUseCase;

  beforeEach(() => {
    storageService = new InMemoryStorageService();
    useCase = new GenerateAttachmentSignedUrlUseCase(storageService);
  });

  it('builds a tmp/ staging filePath regardless of whether a booking exists yet', async () => {
    const result = await useCase.execute({
      fileName: 'car-front.jpg',
      contentType: 'image/jpeg',
      tenantId: TENANT_A,
    });

    expect(result.signedUrl).toContain('http://fake-gcs/bucket/');
    expect(result.filePath).toMatch(new RegExp(`^tmp/${TENANT_A}/[^/]+/car-front\\.jpg$`));
    expect(result.expiresAt).toBeDefined();
  });

  it('generates a unique staging folder each call', async () => {
    const r1 = await useCase.execute({
      fileName: 'a.jpg',
      contentType: 'image/jpeg',
      tenantId: TENANT_A,
    });
    const r2 = await useCase.execute({
      fileName: 'a.jpg',
      contentType: 'image/jpeg',
      tenantId: TENANT_A,
    });
    expect(r1.filePath).not.toBe(r2.filePath);
  });

  it('scopes the generated path to the requesting tenant', async () => {
    const result = await useCase.execute({
      fileName: 'after.jpg',
      contentType: 'image/jpeg',
      tenantId: TENANT_B,
    });

    expect(result.filePath.startsWith(`tmp/${TENANT_B}/`)).toBe(true);
  });
});
