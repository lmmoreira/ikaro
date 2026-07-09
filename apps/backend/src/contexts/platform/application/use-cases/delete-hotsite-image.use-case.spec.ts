import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { HotsiteImageNotUploadedError } from '../../domain/errors/platform-domain.error';
import { DeleteHotsiteImageUseCase } from './delete-hotsite-image.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const IMAGE_PATH = `tenants/${TENANT_A}/hotsite/branding/logo.png`;
const OTHER_TENANT_IMAGE_PATH = `tenants/${TENANT_B}/hotsite/branding/logo.png`;

describe('DeleteHotsiteImageUseCase', () => {
  let storageService: InMemoryStorageService;
  let useCase: DeleteHotsiteImageUseCase;

  beforeEach(() => {
    storageService = new InMemoryStorageService();
    storageService.markAsUploaded(IMAGE_PATH);
    storageService.markAsUploaded(OTHER_TENANT_IMAGE_PATH);
    useCase = new DeleteHotsiteImageUseCase(storageService);
  });

  it('deletes the image from the public bucket', async () => {
    await useCase.execute({ tenantId: TENANT_A, filePath: IMAGE_PATH });

    expect(storageService.deletedPaths).toContain(IMAGE_PATH);
    expect(await storageService.exists(IMAGE_PATH, 'public')).toBe(false);
  });

  it('tenant isolation: cannot delete an image belonging to another tenant', async () => {
    await expect(
      useCase.execute({ tenantId: TENANT_A, filePath: OTHER_TENANT_IMAGE_PATH }),
    ).rejects.toThrow(HotsiteImageNotUploadedError);

    expect(storageService.deletedPaths).not.toContain(OTHER_TENANT_IMAGE_PATH);
  });

  describe('tmp/ staging paths (not-yet-promoted uploads)', () => {
    const TMP_PATH = `tmp/${TENANT_A}/branding/u1/logo.png`;
    const OTHER_TENANT_TMP_PATH = `tmp/${TENANT_B}/branding/u1/logo.png`;

    it('deletes a tmp/ path from the private bucket', async () => {
      storageService.markAsUploaded(TMP_PATH);

      await useCase.execute({ tenantId: TENANT_A, filePath: TMP_PATH });

      expect(storageService.deletedPaths).toContain(TMP_PATH);
      expect(await storageService.exists(TMP_PATH, 'private')).toBe(false);
    });

    it('tenant isolation: cannot delete a tmp/ path belonging to another tenant', async () => {
      storageService.markAsUploaded(OTHER_TENANT_TMP_PATH);

      await expect(
        useCase.execute({ tenantId: TENANT_A, filePath: OTHER_TENANT_TMP_PATH }),
      ).rejects.toThrow(HotsiteImageNotUploadedError);

      expect(storageService.deletedPaths).not.toContain(OTHER_TENANT_TMP_PATH);
    });
  });
});
