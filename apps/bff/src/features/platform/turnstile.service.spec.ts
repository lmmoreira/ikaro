import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { TurnstileService } from './turnstile.service';

const SECRET = 'test-secret-key';

function makeConfigService(secret = SECRET): ConfigService {
  return { getOrThrow: () => secret } as unknown as ConfigService;
}

function makeHttp(): jest.Mocked<Pick<HttpService, 'post'>> {
  return { post: jest.fn() } as jest.Mocked<Pick<HttpService, 'post'>>;
}

describe('TurnstileService', () => {
  it('returns true when Cloudflare siteverify responds with success: true', async () => {
    const http = makeHttp();
    http.post.mockReturnValue(of({ data: { success: true } } as AxiosResponse));
    const service = new TurnstileService(http as unknown as HttpService, makeConfigService());

    const result = await service.verify('valid-token', '203.0.113.10');

    expect(result).toBe(true);
    expect(http.post).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { secret: SECRET, response: 'valid-token', remoteip: '203.0.113.10' },
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  // AC (M20-S05): this negative path must use Cloudflare's real, permanently-valid always-fail
  // test secret against the real siteverify endpoint — not a mocked HTTP response — so this test
  // is the one place a genuine network call is intentional (PR #423 review, Codex: the original
  // version mocked this the same as the success case, which doesn't actually exercise Cloudflare's
  // real API contract).
  it('returns false when Cloudflare siteverify genuinely rejects the always-fail test secret', async () => {
    const realHttp = new HttpService();
    const service = new TurnstileService(
      realHttp,
      makeConfigService('2x0000000000000000000000000000000AA'),
    );

    const result = await service.verify('any-response-token', '203.0.113.10');

    expect(result).toBe(false);
  }, 15_000);

  it('returns false (fails closed) on a network/timeout error, never throwing', async () => {
    const http = makeHttp();
    http.post.mockReturnValue(throwError(() => new Error('timeout')));
    const service = new TurnstileService(http as unknown as HttpService, makeConfigService());

    const result = await service.verify('any-token', '203.0.113.10');

    expect(result).toBe(false);
  });
});
