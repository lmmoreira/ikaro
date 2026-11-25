import { HEADERS_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../../shared/decorators/public.decorator';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { SignupPublicController } from './signup.public.controller';
import { SlugAvailabilityQuerySchema } from './signup.public.schemas';

const THROTTLER_LIMIT = 'THROTTLER:LIMIT';
const THROTTLER_TTL = 'THROTTLER:TTL';

function build(): { controller: SignupPublicController; get: jest.Mock } {
  const get = jest.fn();
  const controller = new SignupPublicController(makeBackendHttp({ get }));
  return { controller, get };
}

describe('SignupPublicController', () => {
  describe('getSlugAvailability', () => {
    it('forwards the slug to the backend slug check and returns its verdict as is', async () => {
      const { controller, get } = build();
      get.mockResolvedValue({ status: 'invalid', reason: 'TOO_SHORT' });

      await expect(controller.getSlugAvailability({ slug: 'ab' })).resolves.toEqual({
        status: 'invalid',
        reason: 'TOO_SHORT',
      });
      expect(get).toHaveBeenCalledWith('/internal/signup/slug-availability', { slug: 'ab' });
    });

    it('propagates a backend failure instead of inventing a verdict', async () => {
      const { controller, get } = build();
      get.mockRejectedValue(new Error('backend down'));

      await expect(controller.getSlugAvailability({ slug: 'lavacar' })).rejects.toThrow(
        'backend down',
      );
    });

    it('is public, never cached and throttled at 30 requests per minute', () => {
      const handler = SignupPublicController.prototype.getSlugAvailability;

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
        { name: 'Cache-Control', value: 'no-store' },
      ]);
      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, handler)).toBe(30);
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, handler)).toBe(60_000);
    });
  });

  describe('SlugAvailabilityQuerySchema', () => {
    it('checks only the shape: a present string, whatever its length or characters', () => {
      for (const slug of ['', 'a', 'UPPER', 'a'.repeat(500), 'dashboard']) {
        expect(SlugAvailabilityQuerySchema.safeParse({ slug }).success).toBe(true);
      }
    });

    it('rejects a missing or non-string slug', () => {
      expect(SlugAvailabilityQuerySchema.safeParse({}).success).toBe(false);
      expect(SlugAvailabilityQuerySchema.safeParse({ slug: ['a', 'b'] }).success).toBe(false);
    });
  });
});
