import { ConfigService } from '@nestjs/config';
import { GcsSignedUrlAdapter } from './gcs-signed-url.adapter';

// Exercises the real adapter against the real fake-gcs-server emulator started in
// integration-global-setup.ts (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md) — every other
// integration spec in this repo swaps STORAGE_SERVICE for InMemoryStorageService, so nothing
// has ever validated real V4 signed-URL PUT/GET, real cross-bucket copy(), or real delete()
// against an actual GCS-compatible backend until this file.
function makeAdapter(): GcsSignedUrlAdapter {
  const configService = {
    get: (key: string) => process.env[key],
  } as unknown as ConfigService;
  return new GcsSignedUrlAdapter(configService);
}

describe('GcsSignedUrlAdapter (integration — real GCS emulator)', () => {
  let adapter: GcsSignedUrlAdapter;

  beforeAll(() => {
    adapter = makeAdapter();
  });

  it('generateWriteSignedUrl produces a URL that can actually be PUT to', async () => {
    const filePath = `tmp/integration-tenant/${Date.now()}/write-test.txt`;
    const { signedUrl } = await adapter.generateWriteSignedUrl(filePath, 'text/plain');

    const putRes = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello from integration test',
    });

    expect(putRes.status).toBe(200);
    await expect(adapter.exists(filePath, 'private')).resolves.toBe(true);
  });

  it('exists() returns false for an object that was never uploaded', async () => {
    const filePath = `tmp/integration-tenant/${Date.now()}/never-uploaded.txt`;
    await expect(adapter.exists(filePath, 'private')).resolves.toBe(false);
  });

  it('copy() with destinationBucket "private" copies within the same (private) bucket', async () => {
    const sourcePath = `tmp/integration-tenant/${Date.now()}/booking-source.jpg`;
    const destPath = `tenants/integration-tenant/bookings/booking-1/${Date.now()}-photo.jpg`;
    const { signedUrl } = await adapter.generateWriteSignedUrl(sourcePath, 'image/jpeg');
    await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: 'fake-jpeg-bytes',
    });

    await adapter.copy(sourcePath, destPath, 'private');

    await expect(adapter.exists(destPath, 'private')).resolves.toBe(true);
    // Confirm it landed in the private bucket, not the public one.
    await expect(adapter.exists(destPath, 'public')).resolves.toBe(false);
  });

  it('copy() defaults to the public bucket (unchanged FeatureBookingPhotoUseCase behavior)', async () => {
    const sourcePath = `tmp/integration-tenant/${Date.now()}/hotsite-source.png`;
    const destPath = `tenants/integration-tenant/hotsite/gallery/${Date.now()}-logo.png`;
    const { signedUrl } = await adapter.generateWriteSignedUrl(sourcePath, 'image/png');
    await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: 'fake-png-bytes',
    });

    await adapter.copy(sourcePath, destPath);

    await expect(adapter.exists(destPath, 'public')).resolves.toBe(true);
    await expect(adapter.exists(destPath, 'private')).resolves.toBe(false);
  });

  it('delete() actually removes the object', async () => {
    const filePath = `tmp/integration-tenant/${Date.now()}/to-delete.txt`;
    const { signedUrl } = await adapter.generateWriteSignedUrl(filePath, 'text/plain');
    await fetch(signedUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
    await expect(adapter.exists(filePath, 'private')).resolves.toBe(true);

    await adapter.delete(filePath, 'private');

    await expect(adapter.exists(filePath, 'private')).resolves.toBe(false);
  });

  it('delete() is idempotent — deleting an already-removed object does not throw', async () => {
    const filePath = `tmp/integration-tenant/${Date.now()}/already-gone.txt`;
    await expect(adapter.delete(filePath, 'private')).resolves.toBeUndefined();
  });

  it('generateReadSignedUrl produces a URL that can actually be GET to retrieve the uploaded bytes', async () => {
    const filePath = `tenants/integration-tenant/bookings/booking-1/${Date.now()}-read-test.txt`;
    const { signedUrl: writeUrl } = await adapter.generateWriteSignedUrl(filePath, 'text/plain');
    await fetch(writeUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: 'read me back',
    });

    const { signedUrl: readUrl } = await adapter.generateReadSignedUrl(filePath, 'private');
    const getRes = await fetch(readUrl);

    expect(getRes.status).toBe(200);
    await expect(getRes.text()).resolves.toBe('read me back');
  });

  it('getPublicUrl returns a stable string template, no round-trip needed', () => {
    const filePath = 'tenants/integration-tenant/hotsite/branding/u1/logo.png';
    expect(adapter.getPublicUrl(filePath)).toBe(
      `${process.env['GCS_PUBLIC_BASE_URL']}/${process.env['GCS_PUBLIC_BUCKET_NAME']}/${filePath}`,
    );
  });
});
