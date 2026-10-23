import { InMemoryStorageService } from '../../test/infrastructure/in-memory-storage.service';
import { AppLogger } from '../observability/app-logger';
import { executeTenantImagePromotion, prepareTenantImagePromotion } from './tenant-image-promotion';

const TENANT = '10000000-0000-4000-8000-000000000001';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000002';

class InvalidPathError extends Error {}

function rules(overrides: { permanentPrefix?: string; tmpPurpose?: string } = {}) {
  return {
    permanentPrefix: `tenants/${TENANT}/`,
    invalidPathError: (path: string) => new InvalidPathError(path),
    ...overrides,
  };
}

describe('prepareTenantImagePromotion()', () => {
  let storage: InMemoryStorageService;

  beforeEach(() => {
    storage = new InMemoryStorageService();
  });

  it('plans the move of an uploaded tmp image to its permanent hotsite path', async () => {
    const tmp = `tmp/${TENANT}/gallery/u1/a.webp`;
    storage.markAsUploaded(tmp);

    await expect(prepareTenantImagePromotion(storage, tmp, TENANT, rules())).resolves.toEqual({
      from: tmp,
      to: `tenants/${TENANT}/hotsite/gallery/u1/a.webp`,
    });
  });

  it('rejects a tmp path that was never uploaded', async () => {
    const tmp = `tmp/${TENANT}/gallery/u1/a.webp`;
    await expect(prepareTenantImagePromotion(storage, tmp, TENANT, rules())).rejects.toBeInstanceOf(
      InvalidPathError,
    );
  });

  it("rejects another tenant's tmp path", async () => {
    const tmp = `tmp/${OTHER_TENANT}/gallery/u1/a.webp`;
    storage.markAsUploaded(tmp);
    await expect(prepareTenantImagePromotion(storage, tmp, TENANT, rules())).rejects.toBeInstanceOf(
      InvalidPathError,
    );
  });

  it('rejects a booking-shaped tmp path (no purpose segment)', async () => {
    const tmp = `tmp/${TENANT}/u1/photo.webp`;
    storage.markAsUploaded(tmp);
    await expect(prepareTenantImagePromotion(storage, tmp, TENANT, rules())).rejects.toBeInstanceOf(
      InvalidPathError,
    );
  });

  it('accepts only the required tmp purpose when one is set', async () => {
    const wrong = `tmp/${TENANT}/gallery/u1/a.webp`;
    const right = `tmp/${TENANT}/service-profile/u1/a.webp`;
    storage.markAsUploaded(wrong);
    storage.markAsUploaded(right);
    const withPurpose = rules({ tmpPurpose: 'service-profile' });

    await expect(
      prepareTenantImagePromotion(storage, wrong, TENANT, withPurpose),
    ).rejects.toBeInstanceOf(InvalidPathError);
    await expect(prepareTenantImagePromotion(storage, right, TENANT, withPurpose)).resolves.toEqual(
      {
        from: right,
        to: `tenants/${TENANT}/hotsite/service-profile/u1/a.webp`,
      },
    );
  });

  it('needs nothing moved for an existing permanent path inside the prefix', async () => {
    const permanent = `tenants/${TENANT}/hotsite/gallery/u1/a.webp`;
    storage.markAsUploaded(permanent);
    await expect(
      prepareTenantImagePromotion(storage, permanent, TENANT, rules()),
    ).resolves.toBeNull();
  });

  it('rejects a permanent path outside the prefix or that does not exist', async () => {
    const outside = `tenants/${OTHER_TENANT}/hotsite/gallery/u1/a.webp`;
    const missing = `tenants/${TENANT}/hotsite/gallery/u1/missing.webp`;
    storage.markAsUploaded(outside);

    await expect(
      prepareTenantImagePromotion(storage, outside, TENANT, rules()),
    ).rejects.toBeInstanceOf(InvalidPathError);
    await expect(
      prepareTenantImagePromotion(storage, missing, TENANT, rules()),
    ).rejects.toBeInstanceOf(InvalidPathError);
  });

  it('honours a narrower permanent prefix', async () => {
    const hotsiteImage = `tenants/${TENANT}/hotsite/gallery/u1/a.webp`;
    storage.markAsUploaded(hotsiteImage);
    const narrow = rules({ permanentPrefix: `tenants/${TENANT}/hotsite/service-profile/` });
    await expect(
      prepareTenantImagePromotion(storage, hotsiteImage, TENANT, narrow),
    ).rejects.toBeInstanceOf(InvalidPathError);
  });
});

describe('executeTenantImagePromotion()', () => {
  it('copies each promotion to the public bucket, deletes the tmp source and the superseded objects', async () => {
    const storage = new InMemoryStorageService();
    const logger = new AppLogger('test');

    await executeTenantImagePromotion(
      storage,
      logger,
      [{ from: 'tmp/t/p/u/a.webp', to: 'tenants/t/hotsite/p/u/a.webp' }],
      ['tenants/t/hotsite/p/old.webp'],
    );

    expect(storage.copiedPaths).toEqual([
      {
        sourcePath: 'tmp/t/p/u/a.webp',
        destinationPath: 'tenants/t/hotsite/p/u/a.webp',
        destinationBucket: 'public',
      },
    ]);
    expect(storage.deletedPaths).toEqual(['tmp/t/p/u/a.webp', 'tenants/t/hotsite/p/old.webp']);
  });

  it('never rethrows: a failing copy is logged and the other operations still run', async () => {
    const storage = new InMemoryStorageService();
    const logger = new AppLogger('test');
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    jest.spyOn(storage, 'copy').mockRejectedValueOnce(new Error('boom'));

    await expect(
      executeTenantImagePromotion(
        storage,
        logger,
        [{ from: 'tmp/t/p/u/a.webp', to: 'tenants/t/hotsite/p/u/a.webp' }],
        ['tenants/t/hotsite/p/old.webp'],
      ),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(storage.deletedPaths).toEqual(['tenants/t/hotsite/p/old.webp']);
  });
});
