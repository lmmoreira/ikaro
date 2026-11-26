import { TenantBuilder } from '../../../../test/builders/platform/tenant.builder';
import { InMemoryTurnstileVerifier } from '../../../../test/infrastructure/in-memory-turnstile-verifier';
import { InMemoryTenantRepository } from '../../../../test/repositories/platform/in-memory-tenant.repository';
import {
  SignupSlugInvalidError,
  SignupSlugTakenError,
  SignupTurnstileFailedError,
} from '../../domain/errors/signup-domain.error';
import { SlugReservedError } from '../../domain/errors/platform-domain.error';
import { SlugPolicy } from '../../domain/slug-policy';
import { ValidateSignupUseCase } from './validate-signup.use-case';

const input = (overrides: Partial<{ slug: string; turnstileToken: string }> = {}) => ({
  slug: 'lavacar-top',
  turnstileToken: 'token-1',
  clientIp: '203.0.113.9',
  ...overrides,
});

describe('ValidateSignupUseCase', () => {
  let tenantRepo: InMemoryTenantRepository;
  let turnstile: InMemoryTurnstileVerifier;
  let useCase: ValidateSignupUseCase;

  beforeEach(() => {
    tenantRepo = new InMemoryTenantRepository();
    turnstile = new InMemoryTurnstileVerifier();
    useCase = new ValidateSignupUseCase(new SlugPolicy('ikaro'), tenantRepo, turnstile);
  });

  it('passes a free, valid slug with a verified token, forwarding the client IP', async () => {
    await expect(useCase.execute(input())).resolves.toBeUndefined();

    expect(turnstile.calls).toEqual([{ token: 'token-1', remoteIp: '203.0.113.9' }]);
  });

  it('refuses a failed Turnstile with SIGNUP_TURNSTILE_FAILED', async () => {
    turnstile.result = false;

    await expect(useCase.execute(input())).rejects.toBeInstanceOf(SignupTurnstileFailedError);
  });

  it('refuses a taken slug with SIGNUP_SLUG_TAKEN', async () => {
    await tenantRepo.save(new TenantBuilder().withSlug('lavacar-top').build());

    await expect(useCase.execute(input())).rejects.toBeInstanceOf(SignupSlugTakenError);
  });

  it.each([['dashboard'], ['ikaro']])(
    'refuses the reserved word %s, and the owner slug, with SIGNUP_SLUG_RESERVED',
    async (slug) => {
      await expect(useCase.execute(input({ slug }))).rejects.toBeInstanceOf(SlugReservedError);
    },
  );

  it.each([
    ['ab', 'TOO_SHORT'],
    ['Has Space', 'INVALID_CHARACTERS'],
    ['-lead', 'INVALID_HYPHEN'],
  ])('refuses the slug %s with SIGNUP_SLUG_INVALID (%s)', async (slug, reason) => {
    const thrown = await useCase.execute(input({ slug })).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(SignupSlugInvalidError);
    expect((thrown as SignupSlugInvalidError).reason).toBe(reason);
  });

  // A typo must not spend the visitor's single-use Turnstile token.
  it.each([
    ['an invalid slug', input({ slug: 'ab' })],
    ['a reserved slug', input({ slug: 'dashboard' })],
  ])('does not consume the Turnstile token for %s', async (_name, request) => {
    await useCase.execute(request).catch(() => undefined);

    expect(turnstile.calls).toHaveLength(0);
  });

  it('does not consume the token for a taken slug either', async () => {
    await tenantRepo.save(new TenantBuilder().withSlug('lavacar-top').build());
    await useCase.execute(input()).catch(() => undefined);

    expect(turnstile.calls).toHaveLength(0);
  });

  // Negative guarantee: the validate call persists nothing.
  it('writes no tenant', async () => {
    await useCase.execute(input());

    await expect(tenantRepo.existsBySlug('lavacar-top')).resolves.toBe(false);
  });
});
