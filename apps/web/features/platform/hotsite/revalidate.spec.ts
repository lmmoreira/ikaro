import { describe, expect, it } from 'vitest';
import { hotsiteManifestCacheTag, hotsiteServicesCacheTag } from './revalidate';

describe('hotsiteManifestCacheTag', () => {
  it('builds a stable, slug-scoped tag', () => {
    expect(hotsiteManifestCacheTag('tenant-a')).toBe('hotsite-manifest-tenant-a');
  });

  it('produces distinct tags for distinct slugs', () => {
    expect(hotsiteManifestCacheTag('tenant-a')).not.toBe(hotsiteManifestCacheTag('tenant-b'));
  });

  it('truncates an oversized slug so the tag stays within Next.js\'s 256-char cache tag limit', () => {
    const oversizedSlug = 'a'.repeat(300);

    const tag = hotsiteManifestCacheTag(oversizedSlug);

    expect(tag.length).toBeLessThanOrEqual(256);
    expect(tag.startsWith('hotsite-manifest-')).toBe(true);
  });
});

describe('hotsiteServicesCacheTag', () => {
  it('builds a stable, slug-scoped tag', () => {
    expect(hotsiteServicesCacheTag('tenant-a')).toBe('hotsite-services-tenant-a');
  });

  it('produces distinct tags for distinct slugs', () => {
    expect(hotsiteServicesCacheTag('tenant-a')).not.toBe(hotsiteServicesCacheTag('tenant-b'));
  });

  it('is distinct from the manifest tag for the same slug', () => {
    expect(hotsiteServicesCacheTag('tenant-a')).not.toBe(hotsiteManifestCacheTag('tenant-a'));
  });

  it('truncates an oversized slug so the tag stays within Next.js\'s 256-char cache tag limit', () => {
    const oversizedSlug = 'a'.repeat(300);

    const tag = hotsiteServicesCacheTag(oversizedSlug);

    expect(tag.length).toBeLessThanOrEqual(256);
    expect(tag.startsWith('hotsite-services-')).toBe(true);
  });
});
