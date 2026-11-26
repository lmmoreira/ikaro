import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { CURRENT_TERMS_VERSION, CountryCodeErrorCode, SignupErrorCode } from '@ikaro/types';
import { FixedClock } from '../../../../test/infrastructure/fixed-clock';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemorySignupRegistrationLock } from '../../../../test/repositories/billing/in-memory-signup-registration-lock';
import { InMemorySignupRegistrationRepository } from '../../../../test/repositories/billing/in-memory-signup-registration.repository';
import { ReserveSignupRegistrationSchema } from '../../application/dtos/reserve-signup-registration.dto';
import { GetSignupEligibilityUseCase } from '../../application/use-cases/get-signup-eligibility.use-case';
import { ReleaseSignupRegistrationUseCase } from '../../application/use-cases/release-signup-registration.use-case';
import { ReserveSignupRegistrationUseCase } from '../../application/use-cases/reserve-signup-registration.use-case';
import { InMemoryBillingPlatformPort } from '../../../../test/infrastructure/in-memory-billing-platform.port';
import { InternalBillingRegistrationController } from './internal-billing-registration.controller';

const SUB = 'google-sub-secret-1';
const CPF = '529.982.247-25';

describe('ReserveSignupRegistrationSchema', () => {
  it('requires a countryCode for a SELF_SIGNUP', () => {
    const result = ReserveSignupRegistrationSchema.safeParse({
      source: 'SELF_SIGNUP',
      googleSub: 'sub-1',
      terms: { version: 'v1' },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['countryCode']);
  });

  const parse = (body: unknown) => ReserveSignupRegistrationSchema.safeParse(body);

  it('accepts a full SELF_SIGNUP body', () => {
    expect(
      parse({
        source: 'SELF_SIGNUP',
        googleSub: SUB,
        taxId: CPF,
        countryCode: 'br',
        terms: { version: CURRENT_TERMS_VERSION },
      }).success,
    ).toBe(true);
  });

  it('accepts an OPERATOR body with the exempt flag', () => {
    const result = ReserveSignupRegistrationSchema.safeParse({ source: 'OPERATOR', exempt: true });

    expect(result.success).toBe(true);
    expect(result.data?.exempt).toBe(true);
  });

  it('refuses exempt for a SELF_SIGNUP, pointing at the exempt field', () => {
    const result = ReserveSignupRegistrationSchema.safeParse({
      source: 'SELF_SIGNUP',
      googleSub: 'sub-1',
      terms: { version: 'v1' },
      exempt: true,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toContainEqual(['exempt']);
  });

  it('accepts exempt: false for a SELF_SIGNUP', () => {
    const result = ReserveSignupRegistrationSchema.safeParse({
      source: 'SELF_SIGNUP',
      googleSub: 'sub-1',
      countryCode: 'BR',
      terms: { version: 'v1' },
      exempt: false,
    });

    expect(result.success).toBe(true);
  });

  it('accepts an OPERATOR body with nothing else', () => {
    expect(parse({ source: 'OPERATOR' }).success).toBe(true);
  });

  it.each([
    ['SELF_SIGNUP without googleSub', { source: 'SELF_SIGNUP', terms: { version: 'v1' } }],
    ['taxId without countryCode', { source: 'OPERATOR', taxId: CPF }],
    ['an unsupported countryCode', { source: 'OPERATOR', countryCode: 'ZZ' }],
    ['an unknown source', { source: 'ADMIN' }],
    [
      'a terms version over 20 characters',
      { source: 'OPERATOR', terms: { version: 'x'.repeat(21) } },
    ],
  ])('rejects %s', (_name, body) => {
    expect(parse(body).success).toBe(false);
  });

  it('reports a malformed countryCode as a format error and an unknown one as unsupported', () => {
    const codeOf = (countryCode: string): unknown => {
      const result = parse({ source: 'OPERATOR', countryCode });
      return result.success
        ? undefined
        : (result.error.issues[0] as { params?: { code?: string } }).params?.code;
    };

    expect(codeOf('brazil')).toBeUndefined();
    expect(codeOf('ZZ')).toBe(CountryCodeErrorCode.UNSUPPORTED);
  });

  it('normalises the countryCode to upper case', () => {
    const result = parse({ source: 'OPERATOR', countryCode: 'br' });

    expect(result.success && result.data.countryCode).toBe('BR');
  });
});

describe('InternalBillingRegistrationController', () => {
  let registrations: InMemorySignupRegistrationRepository;
  let controller: InternalBillingRegistrationController;

  beforeEach(() => {
    registrations = new InMemorySignupRegistrationRepository();
    const txManager = new InMemoryTransactionManager();
    controller = new InternalBillingRegistrationController(
      new ReserveSignupRegistrationUseCase(
        registrations,
        new InMemorySignupRegistrationLock(txManager),
        txManager,
        new FixedClock(new Date('2026-11-11T12:00:00Z')),
      ),
      new GetSignupEligibilityUseCase(registrations, new InMemoryBillingPlatformPort()),
      new ReleaseSignupRegistrationUseCase(registrations),
    );
  });

  it('reserves a SELF_SIGNUP and returns the id and the flag', async () => {
    const result = await controller.reserve({
      source: 'SELF_SIGNUP',
      googleSub: SUB,
      taxId: CPF,
      countryCode: 'BR',
      terms: { version: CURRENT_TERMS_VERSION },
    });

    expect(result).toEqual({ registrationId: registrations.saved[0].id, trialAvailable: true });
  });

  it('maps a missing terms to 422 SIGNUP_TERMS_NOT_ACCEPTED', async () => {
    const thrown = await controller
      .reserve({ source: 'SELF_SIGNUP', googleSub: SUB, countryCode: 'BR', taxId: CPF })
      .catch((e) => e);

    expect(thrown).toBeInstanceOf(HttpException);
    expect(thrown.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(thrown.getResponse()).toMatchObject({ code: SignupErrorCode.TERMS_NOT_ACCEPTED });
  });

  it('maps an invalid tax id to 422 SIGNUP_TAX_ID_INVALID', async () => {
    const thrown = await controller
      .reserve({ source: 'OPERATOR', taxId: '111.111.111-11', countryCode: 'BR' })
      .catch((e) => e);

    expect(thrown.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(thrown.getResponse()).toMatchObject({ code: SignupErrorCode.TAX_ID_INVALID });
  });

  // Negative guarantee: the Google sub, tax id and terms never reach a log line, on success or failure.
  it('never logs the Google sub, tax id or terms', async () => {
    const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(),
    );

    await controller.reserve({
      source: 'SELF_SIGNUP',
      googleSub: SUB,
      taxId: CPF,
      countryCode: 'BR',
      terms: { version: CURRENT_TERMS_VERSION },
    });
    await controller
      .reserve({ source: 'SELF_SIGNUP', googleSub: SUB, countryCode: 'BR', taxId: CPF })
      .catch(() => undefined);

    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).not.toContain(SUB);
    expect(logged).not.toContain('52998224725');
    expect(logged).not.toContain('terms');
    spies.forEach((spy) => spy.mockRestore());
  });

  it('maps a country outside SIGNUP_SUPPORTED_COUNTRIES to 422 SIGNUP_COUNTRY_NOT_SUPPORTED', async () => {
    const thrown = await controller
      .reserve({
        source: 'SELF_SIGNUP',
        googleSub: SUB,
        countryCode: 'US',
        taxId: '12-3456789',
        terms: { version: CURRENT_TERMS_VERSION },
      })
      .catch((e) => e);

    expect(thrown.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(thrown.getResponse()).toMatchObject({ code: SignupErrorCode.COUNTRY_NOT_SUPPORTED });
    expect(registrations.saved).toHaveLength(0);
  });

  it('maps a terms version other than the current one to 422 SIGNUP_TERMS_NOT_ACCEPTED', async () => {
    const thrown = await controller
      .reserve({
        source: 'SELF_SIGNUP',
        googleSub: SUB,
        countryCode: 'BR',
        taxId: CPF,
        terms: { version: '2020-01-01' },
      })
      .catch((e) => e);

    expect(thrown.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(thrown.getResponse()).toMatchObject({ code: SignupErrorCode.TERMS_NOT_ACCEPTED });
  });

  it('reads eligibility without reserving anything, and reports the terms version', async () => {
    const result = await controller.eligibility({ googleSub: SUB });

    expect(result).toEqual({
      trialAvailable: true,
      existingTenantSlug: null,
      termsVersion: CURRENT_TERMS_VERSION,
    });
    expect(registrations.saved).toHaveLength(0);
  });

  it('releases a reserved registration, and answers released: false the second time', async () => {
    const reserved = await controller.reserve({
      source: 'SELF_SIGNUP',
      googleSub: SUB,
      taxId: CPF,
      countryCode: 'BR',
      terms: { version: CURRENT_TERMS_VERSION },
    });
    const id = reserved.registrationId as string;

    await expect(controller.release(id)).resolves.toEqual({ released: true });
    await expect(controller.release(id)).resolves.toEqual({ released: false });
    expect(registrations.saved).toHaveLength(0);
  });

  it('never releases a COMPLETED registration', async () => {
    const reserved = await controller.reserve({
      source: 'SELF_SIGNUP',
      googleSub: SUB,
      taxId: CPF,
      countryCode: 'BR',
      terms: { version: CURRENT_TERMS_VERSION },
    });
    const id = reserved.registrationId as string;
    await registrations.complete(registrations.saved[0].complete('tenant-1'));

    await expect(controller.release(id)).resolves.toEqual({ released: false });
    expect(registrations.saved).toHaveLength(1);
  });
});
