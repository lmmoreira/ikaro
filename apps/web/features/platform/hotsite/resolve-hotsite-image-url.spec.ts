import { describe, expect, it } from 'vitest';
import { resolveHotsiteImageUrl } from './resolve-hotsite-image-url';

const BASE_URL = 'http://localhost:4443/ikaro-local-public';

describe('resolveHotsiteImageUrl', () => {
  it('resolves a raw storage path into an absolute URL', () => {
    const rawPath = 'tenants/tenant-a/hotsite/hero/abc/bg.png';

    expect(resolveHotsiteImageUrl(rawPath, BASE_URL)).toBe(`${BASE_URL}/${rawPath}`);
  });

  it('leaves an already-absolute URL unchanged', () => {
    const url = `${BASE_URL}/tenants/tenant-a/hotsite/hero/abc/bg.png`;

    expect(resolveHotsiteImageUrl(url, BASE_URL)).toBe(url);
  });

  it('leaves an empty value unchanged', () => {
    expect(resolveHotsiteImageUrl('', BASE_URL)).toBe('');
  });
});
