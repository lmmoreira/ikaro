import { Injectable } from '@nestjs/common';
import { PlatformErrorCode } from '@ikaro/types/protocol/errors';
import { GetTenantBillingInfoUseCase } from '../../../platform/application/use-cases/get-tenant-billing-info.use-case';
import type {
  BillingTenantInfo,
  IBillingPlatformPort,
} from '../../application/ports/billing-platform.port';
import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';

/** Billing's one read of Platform (a permitted edge): the tenant's creation time and settings basics. */
@Injectable()
export class BillingPlatformAdapter implements IBillingPlatformPort {
  constructor(private readonly getTenantBillingInfo: GetTenantBillingInfoUseCase) {}

  async getTenantInfo(tenantId: string): Promise<BillingTenantInfo> {
    try {
      return await this.getTenantBillingInfo.execute({ tenantId });
    } catch (err: unknown) {
      // Platform's error stays on this side of the boundary: Billing sees only its own typed one.
      // Matched by its wire code, so the adapter's only Platform import is the one use case.
      if (isTenantNotFound(err)) throw new BillingTenantNotFoundError(tenantId);
      throw err;
    }
  }
}

function isTenantNotFound(err: unknown): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as { code: unknown }).code === PlatformErrorCode.TENANT_NOT_FOUND
  );
}
