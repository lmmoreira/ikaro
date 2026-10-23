import { IStorageService } from '../ports/storage.service.port';
import { AppLogger } from '../observability/app-logger';
import { extractTenantIdFromTmpPath } from './extract-tenant-id-from-tmp-path';
import { redactStoragePathForLogging } from './redact-storage-path-for-logging';
import { HOTSITE_TMP_PATH_REGEX } from './tmp-path-regex';

export interface ImagePromotionOperation {
  from: string;
  to: string;
}

export interface TenantImagePathRules {
  /** Where a permanent path must live, e.g. `tenants/<id>/` (hotsite) or `tenants/<id>/hotsite/service-profile/`. */
  permanentPrefix: string;
  /** When set, the tmp path's purpose segment (`tmp/<tenant>/<purpose>/<uuid>/<file>`) must equal it. */
  tmpPurpose?: string;
  /** The caller's own typed domain error for a path that is not acceptable or was never uploaded. */
  invalidPathError: (path: string) => Error;
}

/**
 * Pure validation + existence check for one client-supplied image path — call before the
 * aggregate is mutated/saved. A `tmp/<tenantId>/<purpose>/<uuid>/<file>` upload yields the move to
 * its permanent `tenants/<tenantId>/hotsite/...` path; an already-permanent path inside
 * `rules.permanentPrefix` yields null (nothing to move). Anything else is rejected with the
 * caller's error. No storage is mutated here — the copy/delete runs via executeImagePromotion(),
 * only once the owning row is safely persisted.
 *
 * Shared by the Platform hotsite save and the Booking service public page: both accept the same
 * public-bucket uploads, so the rules live here once (a copy in each context drifted before).
 */
export async function prepareTenantImagePromotion(
  storageService: IStorageService,
  path: string,
  tenantId: string,
  rules: TenantImagePathRules,
): Promise<ImagePromotionOperation | null> {
  const tmpPrefix = `tmp/${tenantId}/`;
  if (path.startsWith(tmpPrefix)) {
    // Requires the purpose-bearing tmp/<tenantId>/<purpose>/<uuid>/<fileName> shape — a same-tenant
    // booking tmp/ upload (no purpose segment) shares the prefix, so the extra segment is what keeps
    // a booking photo from being promoted into the public bucket.
    const purpose = path.split('/')[2];
    const purposeOk = rules.tmpPurpose === undefined || purpose === rules.tmpPurpose;
    if (
      !HOTSITE_TMP_PATH_REGEX.test(path) ||
      extractTenantIdFromTmpPath(path) !== tenantId ||
      !purposeOk
    ) {
      throw rules.invalidPathError(path);
    }
    if (!(await storageService.exists(path, 'private'))) throw rules.invalidPathError(path);
    return { from: path, to: `tenants/${tenantId}/hotsite/${path.slice(tmpPrefix.length)}` };
  }

  if (!path.startsWith(rules.permanentPrefix)) throw rules.invalidPathError(path);
  if (!(await storageService.exists(path, 'public'))) throw rules.invalidPathError(path);
  return null;
}

/**
 * Actual copy+delete — call via scheduleAfterCommit(), only after the owning row is saved.
 * Best-effort per file: each operation catches its own error (never rethrows), so running them
 * concurrently is safe — there is no shared state and no ordering dependency between files.
 */
export async function executeTenantImagePromotion(
  storageService: IStorageService,
  logger: AppLogger,
  promotions: ImagePromotionOperation[],
  deletions: string[],
): Promise<void> {
  await Promise.all(
    promotions.map(async ({ from, to }) => {
      try {
        await storageService.copy(from, to, 'public');
        await storageService.delete(from, 'private');
      } catch (err) {
        // Best-effort — the row already points at `to`; a failed copy just means that path 404s
        // until manually reconciled, not a broken save. Filenames are redacted — see
        // redactStoragePathForLogging's doc comment.
        logger.error(
          `Failed to promote image from ${redactStoragePathForLogging(from)} to ${redactStoragePathForLogging(to)}: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }),
  );

  await Promise.all(
    deletions.map(async (path) => {
      try {
        await storageService.delete(path, 'public');
      } catch (err) {
        // Best-effort — the reference is already gone from the row either way.
        logger.error(
          `Failed to delete superseded image ${redactStoragePathForLogging(path)}: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }),
  );
}
