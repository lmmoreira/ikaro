import { BOOKING_TMP_PHOTO_PATH_REGEX, HOTSITE_TMP_PATH_REGEX } from './tmp-path-regex';

describe('HOTSITE_TMP_PATH_REGEX', () => {
  it('matches tmp/<tenantId>/<purpose>/<uuid>/<fileName>', () => {
    expect(HOTSITE_TMP_PATH_REGEX.test('tmp/tenant-1/branding/u1/logo.png')).toBe(true);
  });

  it('rejects a non-tmp path', () => {
    expect(HOTSITE_TMP_PATH_REGEX.test('tenants/tenant-1/hotsite/branding/logo.png')).toBe(false);
  });

  it('rejects a bare tmp/<id> path with no trailing segment', () => {
    expect(HOTSITE_TMP_PATH_REGEX.test('tmp/tenant-1')).toBe(false);
  });

  it('rejects a booking tmp/ path (tmp/<tenantId>/<uuid>/<fileName>, no purpose segment)', () => {
    // Guards the cross-feature gap flagged in PR #103 review: booking's tmp/ shape is one
    // segment shorter than hotsite's, and must not be accepted by hotsite-scoped validation.
    expect(HOTSITE_TMP_PATH_REGEX.test('tmp/tenant-1/u1/car.jpg')).toBe(false);
  });
});

describe('BOOKING_TMP_PHOTO_PATH_REGEX', () => {
  it('matches tmp/<tenantId>/<uuid>/<fileName>', () => {
    expect(BOOKING_TMP_PHOTO_PATH_REGEX.test('tmp/tenant-1/u1/car.jpg')).toBe(true);
  });

  it('rejects a non-tmp path', () => {
    expect(BOOKING_TMP_PHOTO_PATH_REGEX.test('tenants/tenant-1/uploads/u1/car.jpg')).toBe(false);
  });

  it('rejects a bare tmp/<id> path with no trailing segments', () => {
    expect(BOOKING_TMP_PHOTO_PATH_REGEX.test('tmp/tenant-1')).toBe(false);
  });
});
