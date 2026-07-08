import { afterEach, describe, expect, it } from 'vitest';
import {
  hotsiteImageBaseUrl,
  resolveHotsiteImageDisplayUrl,
  resolveHotsiteImageUrl,
} from './resolve-hotsite-image-url';

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

  it('does not produce a double slash when baseUrl has a trailing slash', () => {
    const rawPath = 'tenants/tenant-a/hotsite/hero/abc/bg.png';

    expect(resolveHotsiteImageUrl(rawPath, `${BASE_URL}/`)).toBe(`${BASE_URL}/${rawPath}`);
  });
});

describe('hotsiteImageBaseUrl / resolveHotsiteImageDisplayUrl', () => {
  const originalValue = process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL = originalValue;
  });

  it('reads NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL from the environment', () => {
    process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL = BASE_URL;

    expect(hotsiteImageBaseUrl()).toBe(BASE_URL);
  });

  it('falls back to an empty string when unset', () => {
    delete process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL;

    expect(hotsiteImageBaseUrl()).toBe('');
  });

  it('resolves a raw path against the environment base URL', () => {
    process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL = BASE_URL;
    const rawPath = 'tenants/tenant-a/hotsite/hero/abc/bg.png';

    expect(resolveHotsiteImageDisplayUrl(rawPath)).toBe(`${BASE_URL}/${rawPath}`);
  });
});
