import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NO_FEATURE_GATE_KEY, SUSPENSION_ACCESS_KEY } from '@ikaro/nestjs-http';
import { PlatformErrorCode } from '@ikaro/types';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { InMemoryTenantAccessPort } from '../../../../test/infrastructure/in-memory-tenant-access.port';
import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';
import { InternalBillingAccessController } from './internal-billing-access.controller';

class NotFoundTenantAccessPort extends InMemoryTenantAccessPort {
  override getAccess(tenantId: string): Promise<never> {
    return Promise.reject(new BillingTenantNotFoundError(tenantId));
  }
}

describe('InternalBillingAccessController', () => {
  it('declares the access read reachable while a tenant is suspended, so the gate can read the answer that suspends it', () => {
    const reflector = new Reflector();
    const handler = InternalBillingAccessController.prototype.getAccess;

    expect(reflector.get(NO_FEATURE_GATE_KEY, handler)).toBe(true);
    expect(reflector.get(SUSPENSION_ACCESS_KEY, handler)).toBe('ANY_AUTHENTICATED');
  });

  it('returns the full backend answer, reason included, for the BFF to reduce', async () => {
    const access = new InMemoryTenantAccessPort();
    const tenantId = uuidv7();
    access.seedSuspended(tenantId);

    const result = await new InternalBillingAccessController(access).getAccess(tenantId);

    expect(result).toEqual({
      status: 'SUSPENDED',
      suspensionReason: 'NON_PAYMENT',
      operational: false,
      features: [],
    });
  });

  it('answers an unknown tenant with a 404 TENANT_NOT_FOUND', async () => {
    const controller = new InternalBillingAccessController(new NotFoundTenantAccessPort());

    const thrown = await controller.getAccess(uuidv7()).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect((thrown as HttpException).getResponse()).toMatchObject({
      code: PlatformErrorCode.TENANT_NOT_FOUND,
    });
  });

  it('wraps the suspended ids as { tenantIds }', async () => {
    const access = new InMemoryTenantAccessPort();
    const a = uuidv7();
    const b = uuidv7();
    access.seedSuspended(a);
    access.seedSuspended(b);

    await expect(
      new InternalBillingAccessController(access).listSuspendedTenantIds(),
    ).resolves.toEqual({ tenantIds: [a, b] });
  });
});
