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
});
