import { Injectable } from '@nestjs/common';
import {
  TenantProvisioningService,
  type TenantProvisioningInput,
  type TenantProvisioningResult,
} from '../services/tenant-provisioning.service';

export type ProvisionTenantUseCaseInput = TenantProvisioningInput;

export type ProvisionTenantUseCaseResult = TenantProvisioningResult;

/**
 * The operator's tenant provisioning (UC-024). A thin entry point over `TenantProvisioningService`,
 * which the public signup shares (UC-127).
 */
@Injectable()
export class ProvisionTenantUseCase {
  constructor(private readonly provisioning: TenantProvisioningService) {}

  execute(input: ProvisionTenantUseCaseInput): Promise<ProvisionTenantUseCaseResult> {
    return this.provisioning.provision(input);
  }
}
