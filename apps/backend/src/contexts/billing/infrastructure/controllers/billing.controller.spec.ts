import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { NO_FEATURE_GATE_KEY, SUSPENSION_ACCESS_KEY, ZodValidationPipe } from '@ikaro/nestjs-http';
import { ManagerRoleGuard } from '../../../../shared/guards/manager-role.guard';
import { RequestContext } from '../../../../shared/request/request-context';
import { ListBillingChargesSchema } from '../../application/dtos/billing-reads.dto';
import type { GetBillingSummaryUseCase } from '../../application/use-cases/get-billing-summary.use-case';
import type { ListBillingChargesUseCase } from '../../application/use-cases/list-billing-charges.use-case';
import { BillingController } from './billing.controller';

const TENANT_ID = '0197b0a0-0000-7000-8000-0000000000a1';

describe('BillingController', () => {
  const reflector = new Reflector();
  const summaryUseCase = { execute: jest.fn() };
  const chargesUseCase = { execute: jest.fn() };
  const context = { tenantId: TENANT_ID } as RequestContext;
  let controller: BillingController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new BillingController(
      summaryUseCase as unknown as GetBillingSummaryUseCase,
      chargesUseCase as unknown as ListBillingChargesUseCase,
      context,
    );
  });

  describe('tenant-access metadata (the routes a suspended manager must reach)', () => {
    it('declares the manager-billing suspension policy and skips the entitlement gate on the class', () => {
      expect(reflector.get(SUSPENSION_ACCESS_KEY, BillingController)).toBe('MANAGER_BILLING');
      expect(reflector.get(NO_FEATURE_GATE_KEY, BillingController)).toBe(true);
    });

    it('guards every route with the manager role guard', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, BillingController)).toEqual([ManagerRoleGuard]);
    });
  });

  it('reads the summary of the caller’s own tenant, never of a parameter', async () => {
    summaryUseCase.execute.mockResolvedValue({ provisioning: true });

    await expect(controller.summary()).resolves.toEqual({ provisioning: true });

    expect(summaryUseCase.execute).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('lists the caller’s own charges with the validated page', async () => {
    chargesUseCase.execute.mockResolvedValue({ items: [], pagination: {} });

    await controller.charges({ limit: 10, offset: 20 });

    expect(chargesUseCase.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      limit: 10,
      offset: 20,
    });
  });

  describe('the charges query schema', () => {
    const pipe = new ZodValidationPipe(ListBillingChargesSchema);

    it('defaults to limit 25 and offset 0', () => {
      expect(pipe.transform({})).toEqual({ limit: 25, offset: 0 });
    });

    it.each([
      [{ limit: '0' }],
      [{ limit: '101' }],
      [{ limit: '-1' }],
      [{ offset: '-1' }],
      [{ limit: 'x' }],
    ])('rejects %j', (query) => {
      expect(() => pipe.transform(query)).toThrow();
    });
  });
});
