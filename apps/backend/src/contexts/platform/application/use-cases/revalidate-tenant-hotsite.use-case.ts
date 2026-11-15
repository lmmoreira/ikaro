import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  FRONTEND_REVALIDATION_PORT,
  IFrontendRevalidationPort,
} from '../ports/frontend-revalidation.port';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface RevalidateTenantHotsiteUseCaseInput {
  tenantId: string;
  correlationId: string;
}

export interface RevalidateTenantHotsiteUseCaseResult {
  revalidated: boolean;
}

/**
 * Refreshes a tenant's public hotsite pages after its access changed (suspended or reactivated).
 * Best effort: the hotsite's effective `isPublished` is computed on read, so a failed refresh only
 * leaves the old page until its ISR window ends. It never mutates the manager's `isPublished`.
 */
@Injectable()
export class RevalidateTenantHotsiteUseCase {
  static readonly CONSUMER_NAME_ON_SUSPENSION = 'revalidate-hotsite-on-suspension';
  static readonly CONSUMER_NAME_ON_REACTIVATION = 'revalidate-hotsite-on-reactivation';

  private readonly logger = new AppLogger(RevalidateTenantHotsiteUseCase.name);

  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
    @Inject(FRONTEND_REVALIDATION_PORT)
    private readonly frontendRevalidation: IFrontendRevalidationPort,
  ) {}

  async execute({
    tenantId,
    correlationId,
  }: RevalidateTenantHotsiteUseCaseInput): Promise<RevalidateTenantHotsiteUseCaseResult> {
    try {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) {
        this.logger.warn('Hotsite revalidation skipped: tenant not found', {
          tenantId,
          correlationId,
        });
        return { revalidated: false };
      }

      await this.frontendRevalidation.revalidate(tenant.slug.value);
      return { revalidated: true };
    } catch (err) {
      this.logger.warn('Hotsite revalidation failed; the page refreshes when its ISR window ends', {
        tenantId,
        correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
      return { revalidated: false };
    }
  }
}
