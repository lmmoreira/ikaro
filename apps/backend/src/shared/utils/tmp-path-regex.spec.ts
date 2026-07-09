import { BOOKING_TMP_PHOTO_PATH_REGEX, TMP_PATH_REGEX } from './tmp-path-regex';

describe('TMP_PATH_REGEX', () => {
  it('matches a tmp/ path with any tail shape', () => {
    expect(TMP_PATH_REGEX.test('tmp/tenant-1/branding/u1/logo.png')).toBe(true);
    expect(TMP_PATH_REGEX.test('tmp/tenant-1/u1/car.jpg')).toBe(true);
  });

  it('rejects a non-tmp path', () => {
    expect(TMP_PATH_REGEX.test('tenants/tenant-1/hotsite/branding/logo.png')).toBe(false);
  });

  it('rejects a bare tmp/<id> path with no trailing segment', () => {
    expect(TMP_PATH_REGEX.test('tmp/tenant-1')).toBe(false);
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
