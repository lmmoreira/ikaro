import { describe, expect, it } from 'vitest';
import { hotsiteManifestCacheTag } from './revalidate';

describe('hotsiteManifestCacheTag', () => {
  it('builds a stable, slug-scoped tag', () => {
    expect(hotsiteManifestCacheTag('tenant-a')).toBe('hotsite-manifest-tenant-a');
  });

  it('produces distinct tags for distinct slugs', () => {
    expect(hotsiteManifestCacheTag('tenant-a')).not.toBe(hotsiteManifestCacheTag('tenant-b'));
  });
});
