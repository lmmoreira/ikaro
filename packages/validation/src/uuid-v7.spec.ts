import { isUuidV7, uuidv7 } from './uuid-v7';

describe('uuidv7', () => {
  it('generates something isUuidV7 accepts as valid', () => {
    expect(isUuidV7(uuidv7())).toBe(true);
  });
});

describe('isUuidV7', () => {
  it('accepts a well-formed UUIDv7 string', () => {
    expect(isUuidV7('019f80a4-677e-7814-b7d5-eed67931c493')).toBe(true);
  });

  it('rejects a UUIDv4 (wrong version nibble)', () => {
    expect(isUuidV7('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('rejects arbitrary non-UUID strings', () => {
    expect(isUuidV7('test-correlation-id')).toBe(false);
    expect(isUuidV7('')).toBe(false);
    expect(isUuidV7('<script>alert(1)</script>')).toBe(false);
  });
});
