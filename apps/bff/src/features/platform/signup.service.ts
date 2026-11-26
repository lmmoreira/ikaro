import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { SignupTenantResponse } from '@ikaro/types';
import { SignupErrorCode } from '@ikaro/types';
import type { SignupSession } from '../auth/signup-session.service';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import { AppLogger } from '../../shared/observability/app-logger';
import type { SignupTenantBody } from './signup.public.schemas';

// Turnstile's siteverify can take close to 8 s on its own (the web gateway's whole budget), so the
// validate call gets the same 15 s the lead form's submission does (LEAD_FORM_SUBMISSION_TIMEOUT_MS).
export const SIGNUP_VALIDATE_TIMEOUT_MS = 15_000;

interface ReserveResult {
  registrationId: string | null;
  trialAvailable: boolean;
}

interface ProvisionResult {
  tenantId: string;
  slug: string;
}

/** A refusal the backend answered on purpose (a 4xx): nothing was committed by that call. */
function isDefinitiveRefusal(err: unknown): boolean {
  return (
    err instanceof HttpException &&
    err.getStatus() >= HttpStatus.BAD_REQUEST &&
    err.getStatus() < HttpStatus.INTERNAL_SERVER_ERROR
  );
}

/**
 * The self-signup orchestration (UC-127), in the BFF because it spans two contexts (docs/BOUNDED_CONTEXTS.md
 * § Communication Patterns): validate (Platform: the slug and Turnstile, once) → reserve (Billing:
 * the country, the Terms version, the tax id and the trial rule, under lock B-A1) → provision
 * (Platform). The order is fixed so a recoverable error never costs the visitor their trial.
 *
 * Release policy (decided at M26-S24 discovery): the reservation is released only after a
 * **definitive** refusal of the provisioning call, when no tenant was committed. On an ambiguous
 * outcome (a timeout, a network error, a 5xx) it is NOT released: `COMPLETED` is set later by the
 * `TenantProvisioned` handler, so deleting a row whose tenant did commit would leave that tenant
 * with no subscription. The one-hour sweep (UC-140) cleans such a row if no tenant appeared.
 */
@Injectable()
export class SignupService {
  private readonly logger = new AppLogger(SignupService.name);

  constructor(private readonly backendHttp: BackendHttpService) {}

  async signup(
    session: SignupSession,
    body: SignupTenantBody,
    clientIp: string,
  ): Promise<SignupTenantResponse & { tenantId: string }> {
    await this.backendHttp.postWithoutTenant<void>(
      '/internal/signup/validate',
      { slug: body.slug, turnstileToken: body.turnstileToken, clientIp },
      SIGNUP_VALIDATE_TIMEOUT_MS,
    );

    const registrationId = await this.reserve(session, body);

    try {
      const tenant = await this.backendHttp.postWithoutTenant<ProvisionResult>(
        '/internal/signup/tenant',
        {
          name: body.businessName,
          slug: body.slug,
          adminEmail: session.email,
          countryCode: body.countryCode,
          registrationId,
        },
      );
      return {
        tenantId: tenant.tenantId,
        tenantSlug: tenant.slug,
        nextPath: '/ikaro-trial/conta-criada',
      };
    } catch (err: unknown) {
      if (isDefinitiveRefusal(err)) await this.release(registrationId);
      throw err;
    }
  }

  // Billing answers `201 { registrationId: null, trialAvailable: false }` for an ineligible visitor
  // (it never answers 409), so the BFF throws the 409 itself; nothing was reserved, nothing to release.
  private async reserve(session: SignupSession, body: SignupTenantBody): Promise<string> {
    const result = await this.backendHttp.postWithoutTenant<ReserveResult>(
      '/internal/billing/registrations',
      {
        source: 'SELF_SIGNUP',
        googleSub: session.googleSub,
        countryCode: body.countryCode,
        // A blank value is "not given": Billing answers SIGNUP_TAX_ID_REQUIRED / SIGNUP_TERMS_NOT_ACCEPTED
        // for it, instead of the 400 its own shape check would give an empty string.
        ...(body.taxId?.trim() ? { taxId: body.taxId.trim() } : {}),
        ...(body.acceptedTermsVersion?.trim()
          ? { terms: { version: body.acceptedTermsVersion.trim() } }
          : {}),
      },
    );
    if (!result.trialAvailable || result.registrationId === null) {
      throw throwProblemDetail(
        HttpStatus.CONFLICT,
        SignupErrorCode.TRIAL_NOT_AVAILABLE,
        'A trial is not available for this account.',
      );
    }
    return result.registrationId;
  }

  // Best effort: a failed release never replaces the original error, the sweep is the backstop.
  private async release(registrationId: string): Promise<void> {
    try {
      await this.backendHttp.postWithoutTenant(
        `/internal/billing/registrations/${registrationId}/release`,
        {},
      );
    } catch (err: unknown) {
      this.logger.warn(
        `signup release failed for registration ${registrationId}; the one-hour sweep will clear it: ${String(err)}`,
      );
    }
  }
}
