import { Inject, Injectable } from '@nestjs/common';
import type { SlugAvailabilityResponse } from '@ikaro/types';
import { SLUG_POLICY, SlugPolicy } from '../../domain/slug-policy';
import { ITenantRepository, TENANT_REPOSITORY } from '../ports/tenant-repository.port';

export interface CheckSlugAvailabilityUseCaseInput {
  slug: string;
}

export type CheckSlugAvailabilityUseCaseResult = SlugAvailabilityResponse;

/**
 * The public slug check (UC-128). Returns a status and throws nothing: `invalid` and `reserved`
 * answer before any query, and `taken` is read live from the repository (never cached). The owner
 * slug is always reserved here: only the operator path may provision it.
 */
@Injectable()
export class CheckSlugAvailabilityUseCase {
  constructor(
    @Inject(SLUG_POLICY) private readonly slugPolicy: SlugPolicy,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepo: ITenantRepository,
  ) {}

  async execute(
    input: CheckSlugAvailabilityUseCaseInput,
  ): Promise<CheckSlugAvailabilityUseCaseResult> {
    const verdict = this.slugPolicy.validate(input.slug, { allowOwnerSlug: false });
    if (verdict.kind === 'invalid') return { status: 'invalid', reason: verdict.reason };
    if (verdict.kind === 'reserved') return { status: 'reserved' };

    return (await this.tenantRepo.existsBySlug(input.slug))
      ? { status: 'taken' }
      : { status: 'available' };
  }
}
