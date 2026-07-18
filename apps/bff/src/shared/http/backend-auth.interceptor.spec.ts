import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { BackendAuthInterceptor } from './backend-auth.interceptor';
import { IIdentityTokenProvider } from './identity-token-provider.port';

describe('BackendAuthInterceptor', () => {
  function makeHttpService(): HttpService {
    return {
      axiosRef: { interceptors: { request: { use: jest.fn() } } },
    } as unknown as HttpService;
  }

  function makeTokenProvider(header = 'Bearer stub-token'): IIdentityTokenProvider {
    return { getAuthorizationHeader: jest.fn().mockResolvedValue(header) };
  }

  it('does not register an interceptor when BACKEND_AUTH_MODE=none', () => {
    const httpService = makeHttpService();
    const config = new ConfigService({ BACKEND_AUTH_MODE: 'none' });

    new BackendAuthInterceptor(httpService, config, makeTokenProvider()).onModuleInit();

    expect(httpService.axiosRef.interceptors.request.use).not.toHaveBeenCalled();
  });

  it('does not register an interceptor when BACKEND_AUTH_MODE is unset (defaults to none)', () => {
    const httpService = makeHttpService();
    const config = new ConfigService({});

    new BackendAuthInterceptor(httpService, config, makeTokenProvider()).onModuleInit();

    expect(httpService.axiosRef.interceptors.request.use).not.toHaveBeenCalled();
  });

  it('registers an interceptor that attaches a fresh Authorization header when BACKEND_AUTH_MODE=iam', async () => {
    const httpService = makeHttpService();
    const tokenProvider = makeTokenProvider('Bearer fresh-token');
    const config = new ConfigService({
      BACKEND_AUTH_MODE: 'iam',
      BACKEND_INTERNAL_URL: 'https://backend.internal',
    });

    new BackendAuthInterceptor(httpService, config, tokenProvider).onModuleInit();

    const registered = (httpService.axiosRef.interceptors.request.use as jest.Mock).mock
      .calls[0][0];
    const headers = { set: jest.fn() };
    const result = await registered({ url: 'https://backend.internal/v1/bookings', headers });

    expect(tokenProvider.getAuthorizationHeader).toHaveBeenCalledWith('https://backend.internal');
    expect(headers.set).toHaveBeenCalledWith('Authorization', 'Bearer fresh-token');
    expect(result.headers).toBe(headers);
  });

  it('does not attach Authorization to a request that is not going to the backend', async () => {
    const httpService = makeHttpService();
    const tokenProvider = makeTokenProvider();
    const config = new ConfigService({
      BACKEND_AUTH_MODE: 'iam',
      BACKEND_INTERNAL_URL: 'https://backend.internal',
    });

    new BackendAuthInterceptor(httpService, config, tokenProvider).onModuleInit();

    const registered = (httpService.axiosRef.interceptors.request.use as jest.Mock).mock
      .calls[0][0];
    const headers = { set: jest.fn() };
    await registered({ url: 'https://some-other-host.example.com/x', headers });

    expect(tokenProvider.getAuthorizationHeader).not.toHaveBeenCalled();
    expect(headers.set).not.toHaveBeenCalled();
  });

  it('uses BACKEND_AUDIENCE for the token while still guarding by BACKEND_INTERNAL_URL as the connection target', async () => {
    const httpService = makeHttpService();
    const tokenProvider = makeTokenProvider();
    const config = new ConfigService({
      BACKEND_AUTH_MODE: 'iam',
      BACKEND_INTERNAL_URL: 'https://backend.internal',
      BACKEND_AUDIENCE: 'https://backend-run-url.a.run.app',
    });

    new BackendAuthInterceptor(httpService, config, tokenProvider).onModuleInit();

    const registered = (httpService.axiosRef.interceptors.request.use as jest.Mock).mock
      .calls[0][0];
    await registered({ url: 'https://backend.internal/v1/bookings', headers: { set: jest.fn() } });

    expect(tokenProvider.getAuthorizationHeader).toHaveBeenCalledWith(
      'https://backend-run-url.a.run.app',
    );
  });

  it('re-fetches a fresh token on every intercepted request (expiry handled transparently by the provider)', async () => {
    const httpService = makeHttpService();
    const tokenProvider = makeTokenProvider('Bearer token-1');
    const config = new ConfigService({
      BACKEND_AUTH_MODE: 'iam',
      BACKEND_INTERNAL_URL: 'https://backend.internal',
    });

    new BackendAuthInterceptor(httpService, config, tokenProvider).onModuleInit();

    const registered = (httpService.axiosRef.interceptors.request.use as jest.Mock).mock
      .calls[0][0];
    await registered({ url: 'https://backend.internal/a', headers: { set: jest.fn() } });
    await registered({ url: 'https://backend.internal/b', headers: { set: jest.fn() } });

    expect(tokenProvider.getAuthorizationHeader).toHaveBeenCalledTimes(2);
  });
});
