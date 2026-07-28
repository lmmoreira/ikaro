import { HttpException, HttpStatus } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { BffErrorCode } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { resolveTenantIdForAttachmentUpload } from './attachment-tenant-resolver';

const JWT_SECRET = 'test-secret-64-chars-for-bff-spec-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const TENANT_SLUG = 'lavacar-bh';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const BOOKING_ID = '40000000-0000-4000-8000-000000000001';

describe('resolveTenantIdForAttachmentUpload()', () => {
  it('scenario 1 — valid JWT: resolves tenantId from the decoded token', async () => {
    const backendHttp = makeBackendHttp();
    const token = jwt.sign(
      { sub: 'cust-id', tenantId: TENANT_ID, tenantSlug: TENANT_SLUG, role: 'CUSTOMER' },
      JWT_SECRET,
    );

    const tenantId = await resolveTenantIdForAttachmentUpload(backendHttp, {
      authHeader: `Bearer ${token}`,
      guestToken: undefined,
      tenantSlug: undefined,
      jwtSecret: JWT_SECRET,
    });

    expect(tenantId).toBe(TENANT_ID);
    expect(backendHttp.get).not.toHaveBeenCalled();
  });

  it('scenario 2 — no JWT, tenantSlug present: resolves tenantId via withPublicTenant', async () => {
    const backendHttp = makeBackendHttp({
      get: jest.fn().mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG }),
    });

    const tenantId = await resolveTenantIdForAttachmentUpload(backendHttp, {
      authHeader: undefined,
      guestToken: undefined,
      tenantSlug: TENANT_SLUG,
      jwtSecret: JWT_SECRET,
    });

    expect(backendHttp.get).toHaveBeenCalledWith(`/internal/tenants/by-slug/${TENANT_SLUG}`);
    expect(tenantId).toBe(TENANT_ID);
  });

  it('scenario 2 — no JWT, no guestToken, no tenantSlug: throws 400', async () => {
    const backendHttp = makeBackendHttp();

    const err = await resolveTenantIdForAttachmentUpload(backendHttp, {
      authHeader: undefined,
      guestToken: undefined,
      tenantSlug: undefined,
      jwtSecret: JWT_SECRET,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });

  it('scenario 3 — valid guestToken: resolves tenantId from the token', async () => {
    const backendHttp = makeBackendHttp();
    const guestToken = jwt.sign(
      { bookingId: BOOKING_ID, tenantId: TENANT_ID, contactEmail: 'g@test.com' },
      JWT_SECRET,
    );

    const tenantId = await resolveTenantIdForAttachmentUpload(backendHttp, {
      authHeader: undefined,
      guestToken,
      tenantSlug: undefined,
      jwtSecret: JWT_SECRET,
    });

    expect(tenantId).toBe(TENANT_ID);
  });

  it('scenario 3 — invalid guestToken: throws 401 with BFF_GUEST_TOKEN_INVALID', async () => {
    const backendHttp = makeBackendHttp();

    const err = await resolveTenantIdForAttachmentUpload(backendHttp, {
      authHeader: undefined,
      guestToken: 'not-a-valid-jwt',
      tenantSlug: undefined,
      jwtSecret: JWT_SECRET,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: BffErrorCode.GUEST_TOKEN_INVALID,
    });
  });

  it('JWT takes priority over guestToken/tenantSlug when both are present', async () => {
    const backendHttp = makeBackendHttp();
    const token = jwt.sign(
      { sub: 'staff-id', tenantId: TENANT_ID, tenantSlug: TENANT_SLUG, role: 'STAFF' },
      JWT_SECRET,
    );

    const tenantId = await resolveTenantIdForAttachmentUpload(backendHttp, {
      authHeader: `Bearer ${token}`,
      guestToken: 'irrelevant-should-not-be-checked',
      tenantSlug: 'irrelevant-should-not-be-checked',
      jwtSecret: JWT_SECRET,
    });

    expect(tenantId).toBe(TENANT_ID);
  });

  it('Bearer with valid signature but wrong schema is treated as no-JWT (falls through)', async () => {
    const backendHttp = makeBackendHttp();
    const guestShapedToken = jwt.sign(
      { bookingId: BOOKING_ID, tenantId: TENANT_ID, contactEmail: 'g@test.com' },
      JWT_SECRET,
    );

    const err = await resolveTenantIdForAttachmentUpload(backendHttp, {
      authHeader: `Bearer ${guestShapedToken}`,
      guestToken: undefined,
      tenantSlug: undefined,
      jwtSecret: JWT_SECRET,
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
  });
});
