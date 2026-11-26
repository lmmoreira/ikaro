import { HttpException } from '@nestjs/common';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { SIGNUP_VALIDATE_TIMEOUT_MS, SignupService } from './signup.service';
import type { SignupTenantBody } from './signup.public.schemas';

const SESSION = { email: 'dona@gmail.com', name: 'Dona', googleSub: 'sub-123' };
const BODY: SignupTenantBody = {
  businessName: 'Lava Car Top',
  slug: 'lavacar-top',
  countryCode: 'BR',
  taxId: ' 529.982.247-25 ',
  acceptedTermsVersion: '2026-11',
  turnstileToken: 'token-1',
};
const REGISTRATION_ID = '0198aaaa-0000-7000-8000-000000000001';
const IP = '203.0.113.9';

function refusal(status: number, code = 'X'): HttpException {
  return new HttpException({ code, status }, status);
}

function build() {
  const postWithoutTenant = jest.fn();
  const service = new SignupService(makeBackendHttp({ postWithoutTenant }));
  const paths = () => postWithoutTenant.mock.calls.map((call) => call[0] as string);
  return { service, postWithoutTenant, paths };
}

// validate (204), reserve, provision: each success answer.
function happy(postWithoutTenant: jest.Mock): void {
  postWithoutTenant
    .mockResolvedValueOnce(undefined)
    .mockResolvedValueOnce({ registrationId: REGISTRATION_ID, trialAvailable: true })
    .mockResolvedValueOnce({ tenantId: 'tenant-1', slug: 'lavacar-top', name: 'Lava Car Top' });
}

describe('SignupService', () => {
  it('validates, reserves, then provisions, in that fixed order', async () => {
    const { service, postWithoutTenant, paths } = build();
    happy(postWithoutTenant);

    const result = await service.signup(SESSION, BODY, IP);

    expect(paths()).toEqual([
      '/internal/signup/validate',
      '/internal/billing/registrations',
      '/internal/signup/tenant',
    ]);
    expect(result).toEqual({
      tenantId: 'tenant-1',
      tenantSlug: 'lavacar-top',
      nextPath: '/ikaro-trial/conta-criada',
    });
  });

  it('sends Turnstile and the client IP to validate with the long timeout, and nothing else of Billing', async () => {
    const { service, postWithoutTenant } = build();
    happy(postWithoutTenant);

    await service.signup(SESSION, BODY, IP);

    expect(postWithoutTenant).toHaveBeenNthCalledWith(
      1,
      '/internal/signup/validate',
      { slug: 'lavacar-top', turnstileToken: 'token-1', clientIp: IP },
      SIGNUP_VALIDATE_TIMEOUT_MS,
    );
  });

  it('reserves with the Google sub from the session, the trimmed tax id and only the terms version', async () => {
    const { service, postWithoutTenant } = build();
    happy(postWithoutTenant);

    await service.signup(SESSION, BODY, IP);

    expect(postWithoutTenant).toHaveBeenNthCalledWith(2, '/internal/billing/registrations', {
      source: 'SELF_SIGNUP',
      googleSub: 'sub-123',
      countryCode: 'BR',
      taxId: '529.982.247-25',
      terms: { version: '2026-11' },
    });
  });

  it('provisions with the Google email as first manager and the registration id', async () => {
    const { service, postWithoutTenant } = build();
    happy(postWithoutTenant);

    await service.signup(SESSION, BODY, IP);

    expect(postWithoutTenant).toHaveBeenNthCalledWith(3, '/internal/signup/tenant', {
      name: 'Lava Car Top',
      slug: 'lavacar-top',
      adminEmail: 'dona@gmail.com',
      countryCode: 'BR',
      registrationId: REGISTRATION_ID,
    });
  });

  it('omits a blank tax id and a blank terms version, so Billing answers the right code', async () => {
    const { service, postWithoutTenant } = build();
    happy(postWithoutTenant);

    await service.signup(SESSION, { ...BODY, taxId: '  ', acceptedTermsVersion: '' }, IP);

    expect(postWithoutTenant.mock.calls[1][1]).toEqual({
      source: 'SELF_SIGNUP',
      googleSub: 'sub-123',
      countryCode: 'BR',
    });
  });

  describe('a refusal before the reservation', () => {
    it('stops at validate: nothing is reserved, so nothing is released', async () => {
      const { service, postWithoutTenant, paths } = build();
      postWithoutTenant.mockRejectedValueOnce(refusal(400, 'SIGNUP_TURNSTILE_FAILED'));

      await expect(service.signup(SESSION, BODY, IP)).rejects.toMatchObject({ status: 400 });

      expect(paths()).toEqual(['/internal/signup/validate']);
    });

    it('maps trialAvailable: false to 409 SIGNUP_TRIAL_NOT_AVAILABLE and calls neither provision nor release', async () => {
      const { service, postWithoutTenant, paths } = build();
      postWithoutTenant
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ registrationId: null, trialAvailable: false });

      const error = await service.signup(SESSION, BODY, IP).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'SIGNUP_TRIAL_NOT_AVAILABLE',
      });
      expect(paths()).toEqual(['/internal/signup/validate', '/internal/billing/registrations']);
    });

    it('passes a Billing refusal (country, terms, tax id) through unchanged, with nothing to release', async () => {
      const { service, postWithoutTenant, paths } = build();
      postWithoutTenant
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(refusal(422, 'SIGNUP_TAX_ID_INVALID'));

      await expect(service.signup(SESSION, BODY, IP)).rejects.toMatchObject({ status: 422 });

      expect(paths()).not.toContain(`/internal/billing/registrations/${REGISTRATION_ID}/release`);
    });
  });

  describe('release policy: only after a definitive refusal of the provisioning call', () => {
    const releasePath = `/internal/billing/registrations/${REGISTRATION_ID}/release`;

    function provisionFails(error: unknown) {
      const ctx = build();
      ctx.postWithoutTenant
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ registrationId: REGISTRATION_ID, trialAvailable: true })
        .mockRejectedValueOnce(error);
      return ctx;
    }

    it.each([
      [409, 'SIGNUP_SLUG_TAKEN'],
      [422, 'SIGNUP_SLUG_RESERVED'],
      [400, 'X'],
    ])('releases after a definite %s, so an immediate retry succeeds', async (status, code) => {
      const { service, postWithoutTenant, paths } = provisionFails(refusal(status, code));
      postWithoutTenant.mockResolvedValueOnce({ released: true });

      await expect(service.signup(SESSION, BODY, IP)).rejects.toMatchObject({ status });

      expect(paths().at(-1)).toBe(releasePath);
    });

    // Negative guarantee: an ambiguous outcome must never delete a registration whose tenant may
    // have committed (the TenantProvisioned handler would then fail and leave a tenant with no trial).
    it.each([
      [
        'a 503 (the BFF maps a network error or timeout to it)',
        refusal(503, 'BFF_UPSTREAM_UNAVAILABLE'),
      ],
      ['a 500', refusal(500)],
      ['a bare network error', new Error('socket hang up')],
    ])('does NOT release after %s', async (_name, error) => {
      const { service, paths } = provisionFails(error);

      await expect(service.signup(SESSION, BODY, IP)).rejects.toBe(error);

      expect(paths()).toEqual([
        '/internal/signup/validate',
        '/internal/billing/registrations',
        '/internal/signup/tenant',
      ]);
    });

    it('a failed release never replaces the original error', async () => {
      const original = refusal(409, 'SIGNUP_SLUG_TAKEN');
      const { service, postWithoutTenant } = provisionFails(original);
      postWithoutTenant.mockRejectedValueOnce(new Error('release down'));

      await expect(service.signup(SESSION, BODY, IP)).rejects.toBe(original);
    });
  });
});
