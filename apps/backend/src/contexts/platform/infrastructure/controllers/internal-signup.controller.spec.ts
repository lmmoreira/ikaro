import { HttpException, HttpStatus } from '@nestjs/common';
import { SignupErrorCode } from '@ikaro/types';
import { TenantBuilder } from '../../../../test/builders/platform/tenant.builder';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryTurnstileVerifier } from '../../../../test/infrastructure/in-memory-turnstile-verifier';
import { InMemoryHotsiteConfigRepository } from '../../../../test/repositories/platform/in-memory-hotsite-config.repository';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import { SignupTenantSchema, ValidateSignupSchema } from '../../application/dtos/signup.dto';
import { TenantProvisioningService } from '../../application/services/tenant-provisioning.service';
import { SignupTenantUseCase } from '../../application/use-cases/signup-tenant.use-case';
import { ValidateSignupUseCase } from '../../application/use-cases/validate-signup.use-case';
import { SlugPolicy } from '../../domain/slug-policy';
import { InternalSignupController } from './internal-signup.controller';

const validateBody = { slug: 'lavacar-top', turnstileToken: 't', clientIp: '203.0.113.9' };
const tenantBody = {
  name: 'Lava Car Top',
  slug: 'lavacar-top',
  adminEmail: 'dona@gmail.com',
  countryCode: 'BR',
  registrationId: TEST_REGISTRATION_ID,
};

function build() {
  const tenantRepo = new InMemoryTenantRepository(new InMemoryEventBus());
  const turnstile = new InMemoryTurnstileVerifier();
  const policy = new SlugPolicy('ikaro');
  const controller = new InternalSignupController(
    new ValidateSignupUseCase(policy, tenantRepo, turnstile),
    new SignupTenantUseCase(
      new TenantProvisioningService(
        tenantRepo,
        new InMemoryHotsiteConfigRepository(),
        new InMemoryTransactionManager(),
        policy,
      ),
    ),
  );
  return { controller, tenantRepo, turnstile };
}

async function thrown(promise: Promise<unknown>): Promise<HttpException> {
  return (await promise.catch((e: unknown) => e)) as HttpException;
}

describe('InternalSignupController', () => {
  it('validate answers 204 semantics (void) for a free slug with a good token', async () => {
    const { controller } = build();

    await expect(controller.validate(validateBody)).resolves.toBeUndefined();
  });

  it.each([['a failed Turnstile', HttpStatus.BAD_REQUEST, SignupErrorCode.TURNSTILE_FAILED]])(
    'validate maps %s',
    async (_name, status, code) => {
      const { controller, turnstile } = build();
      turnstile.result = false;

      const error = await thrown(controller.validate(validateBody));

      expect(error.getStatus()).toBe(status);
      expect(error.getResponse()).toMatchObject({ code });
    },
  );

  it('validate maps a taken slug to 409 SIGNUP_SLUG_TAKEN', async () => {
    const { controller, tenantRepo } = build();
    await tenantRepo.save(new TenantBuilder().withSlug('lavacar-top').build());

    const error = await thrown(controller.validate(validateBody));

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.getResponse()).toMatchObject({ code: SignupErrorCode.SLUG_TAKEN, field: 'slug' });
  });

  it('validate maps an invalid slug to 422 SIGNUP_SLUG_INVALID and a reserved one to 422 SIGNUP_SLUG_RESERVED', async () => {
    const { controller } = build();

    const invalid = await thrown(controller.validate({ ...validateBody, slug: 'ab' }));
    const reserved = await thrown(controller.validate({ ...validateBody, slug: 'dashboard' }));

    expect(invalid.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(invalid.getResponse()).toMatchObject({ code: SignupErrorCode.SLUG_INVALID });
    expect(reserved.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(reserved.getResponse()).toMatchObject({ code: SignupErrorCode.SLUG_RESERVED });
  });

  it('tenant provisions and returns the new tenant', async () => {
    const { controller, tenantRepo } = build();

    await expect(controller.tenant(tenantBody)).resolves.toMatchObject({ slug: 'lavacar-top' });
    await expect(tenantRepo.existsBySlug('lavacar-top')).resolves.toBe(true);
  });

  it('tenant maps a slug taken at commit time to 409 SIGNUP_SLUG_TAKEN', async () => {
    const { controller, tenantRepo } = build();
    await tenantRepo.save(new TenantBuilder().withSlug('lavacar-top').build());

    const error = await thrown(controller.tenant(tenantBody));

    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.getResponse()).toMatchObject({ code: SignupErrorCode.SLUG_TAKEN });
  });

  it('tenant never verifies Turnstile', async () => {
    const { controller, turnstile } = build();

    await controller.tenant(tenantBody);

    expect(turnstile.calls).toHaveLength(0);
  });
});

describe('signup schemas', () => {
  it('require a registration id that is a UUID and a verified-looking email', () => {
    expect(SignupTenantSchema.safeParse({ ...tenantBody, registrationId: 'nope' }).success).toBe(
      false,
    );
    expect(SignupTenantSchema.safeParse({ ...tenantBody, adminEmail: 'nope' }).success).toBe(false);
    expect(SignupTenantSchema.safeParse(tenantBody).success).toBe(true);
  });

  it('require a Turnstile token and a client IP on validate', () => {
    expect(ValidateSignupSchema.safeParse({ ...validateBody, turnstileToken: '' }).success).toBe(
      false,
    );
    expect(ValidateSignupSchema.safeParse({ slug: 'a' }).success).toBe(false);
  });

  it('take no tax id, terms version or email/name from the visitor on validate', () => {
    const parsed = ValidateSignupSchema.parse({
      ...validateBody,
      taxId: '1',
      acceptedTermsVersion: 'x',
    });

    expect(Object.keys(parsed).sort()).toEqual(['clientIp', 'slug', 'turnstileToken']);
  });
});
