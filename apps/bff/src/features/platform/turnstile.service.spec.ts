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

  it('returns false when Cloudflare siteverify responds with success: false', async () => {
    const http = makeHttp();
    http.post.mockReturnValue(of({ data: { success: false } } as AxiosResponse));
    const service = new TurnstileService(http as unknown as HttpService, makeConfigService());

    const result = await service.verify('invalid-token', '203.0.113.10');

    expect(result).toBe(false);
  });

  it('returns false (fails closed) on a network/timeout error, never throwing', async () => {
    const http = makeHttp();
    http.post.mockReturnValue(throwError(() => new Error('timeout')));
    const service = new TurnstileService(http as unknown as HttpService, makeConfigService());

    const result = await service.verify('any-token', '203.0.113.10');

    expect(result).toBe(false);
  });
});
