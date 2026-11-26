import { Inject, Injectable } from '@nestjs/common';
import { CURRENT_TERMS_VERSION } from '@ikaro/types';
import { BILLING_PLATFORM_PORT, type IBillingPlatformPort } from '../ports/billing-platform.port';
import {
  ISignupRegistrationRepository,
  SIGNUP_REGISTRATION_REPOSITORY,
} from '../ports/signup-registration-repository.port';
import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';
import { type GoogleSubHistoryEntry, isGoogleSubEligible } from '../../domain/trial-eligibility';

export interface GetSignupEligibilityUseCaseInput {
  googleSub: string;
}

export interface GetSignupEligibilityUseCaseResult {
  /** The Google half of the trial rule only; the tax id is checked at the reservation. */
  trialAvailable: boolean;
  /** The earliest unpaid self-signup tenant of this `sub`, so the page can offer sign-in. */
  existingTenantSlug: string | null;
  /** The Terms version the visitor must accept (`CURRENT_TERMS_VERSION`). */
  termsVersion: string;
}

/**
 * The read behind `GET /v1/public/signup/session` (UC-127). Read-only by design: no lock and no
 * insert, because a read must never reserve (`POST /internal/billing/registrations` does that).
 */
@Injectable()
export class GetSignupEligibilityUseCase {
  constructor(
    @Inject(SIGNUP_REGISTRATION_REPOSITORY)
    private readonly registrations: ISignupRegistrationRepository,
    @Inject(BILLING_PLATFORM_PORT) private readonly platform: IBillingPlatformPort,
  ) {}

  async execute(
    input: GetSignupEligibilityUseCaseInput,
  ): Promise<GetSignupEligibilityUseCaseResult> {
    const history = await this.registrations.findGoogleSubHistory(input.googleSub);
    const trialAvailable = isGoogleSubEligible(history);
    return {
      trialAvailable,
      existingTenantSlug: trialAvailable ? null : await this.earliestUnpaidSlug(history),
      termsVersion: CURRENT_TERMS_VERSION,
    };
  }

  // A `RESERVED` entry has no tenant yet and a paid one needs no sign-in offer, so only a
  // `COMPLETED`, never-paid entry with a tenant counts; the earliest by creation time wins.
  private async earliestUnpaidSlug(history: GoogleSubHistoryEntry[]): Promise<string | null> {
    const unpaid = history
      .filter((entry) => entry.status === 'COMPLETED' && !entry.hasEverPaid && entry.tenantId)
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
    const tenantId = unpaid[0]?.tenantId;
    if (!tenantId) return null;
    try {
      return (await this.platform.getTenantInfo(tenantId)).slug;
    } catch (err: unknown) {
      if (err instanceof BillingTenantNotFoundError) return null;
      throw err;
    }
  }
}
