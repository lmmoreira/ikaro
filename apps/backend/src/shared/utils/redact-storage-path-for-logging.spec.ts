import { redactStoragePathForLogging } from './redact-storage-path-for-logging';

describe('redactStoragePathForLogging', () => {
  it('replaces the final filename segment of a permanent hotsite path', () => {
    expect(
      redactStoragePathForLogging(
        'tenants/tenant-1/hotsite/branding/019fab3b-0000-7000-8000-000000000001/joao-silva-rg.jpg',
      ),
    ).toBe('tenants/tenant-1/hotsite/branding/019fab3b-0000-7000-8000-000000000001/<redacted>');
  });

  it('replaces the final filename segment of a tmp/ staging path', () => {
    expect(redactStoragePathForLogging('tmp/tenant-1/seo-og-image/u1/maria-perfil.png')).toBe(
      'tmp/tenant-1/seo-og-image/u1/<redacted>',
    );
  });

  it('returns a fixed placeholder for a path with no "/" at all', () => {
    expect(redactStoragePathForLogging('no-slashes-here.png')).toBe('<redacted>');
  });
});
