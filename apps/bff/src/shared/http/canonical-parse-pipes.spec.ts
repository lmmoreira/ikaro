import { ArgumentMetadata, HttpException, HttpStatus } from '@nestjs/common';
import { GenericErrorCode } from '@ikaro/types';
import { CanonicalParseIntPipe, CanonicalParseUUIDPipe } from './canonical-parse-pipes';

const UUID_METADATA: ArgumentMetadata = { type: 'param', data: 'id' };
const INT_METADATA: ArgumentMetadata = { type: 'query', data: 'limit' };

describe('CanonicalParseUUIDPipe', () => {
  const pipe = new CanonicalParseUUIDPipe();

  it('passes through a valid UUID', async () => {
    const uuid = '10000000-0000-4000-8000-000000000001';
    await expect(pipe.transform(uuid, UUID_METADATA)).resolves.toBe(uuid);
  });

  it('throws the canonical envelope with GenericErrorCode.FORMAT_INVALID and the param name as field', async () => {
    const err = await pipe.transform('not-a-uuid', UUID_METADATA).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect((err as HttpException).getResponse()).toMatchObject({
      type: 'about:blank',
      status: 400,
      code: GenericErrorCode.FORMAT_INVALID,
      field: 'id',
    });
  });

  it('falls back to a generic field name when metadata.data is absent', async () => {
    const err = await pipe.transform('not-a-uuid', { type: 'param' }).catch((e: unknown) => e);
    expect((err as HttpException).getResponse()).toMatchObject({ field: 'value' });
  });
});

describe('CanonicalParseIntPipe', () => {
  const pipe = new CanonicalParseIntPipe();

  it('passes through a valid integer', async () => {
    await expect(pipe.transform('42', INT_METADATA)).resolves.toBe(42);
  });

  it('throws the canonical envelope with GenericErrorCode.VALUE_INVALID and the param name as field', async () => {
    const err = await pipe.transform('not-a-number', INT_METADATA).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect((err as HttpException).getResponse()).toMatchObject({
      type: 'about:blank',
      status: 400,
      code: GenericErrorCode.VALUE_INVALID,
      field: 'limit',
    });
  });
});
