import { HttpService } from '@nestjs/axios';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IDENTITY_TOKEN_PROVIDER, IIdentityTokenProvider } from './identity-token-provider.port';

// Registers ONE axios request interceptor, once, on the shared axios
// instance backing every HttpService in this app (@nestjs/axios's
// HttpModule -- imported plain, without .register() -- always resolves to
// the same underlying axios default instance, regardless of which module
// does the importing). This single registration covers all three call
// patterns that reach the backend: BackendHttpService's headers()-based
// methods, its *ForPublic methods, and HealthController's separately
// injected HttpService for the readiness ping (M17-S47 discovery).
//
// Must run from a singleton provider, never from BackendHttpService itself
// -- that class is request-scoped, so a new instance (and a new
// interceptor registration) would be created on every incoming request.
@Injectable()
export class BackendAuthInterceptor implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
    @Inject(IDENTITY_TOKEN_PROVIDER) private readonly tokenProvider: IIdentityTokenProvider,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('BACKEND_AUTH_MODE') !== 'iam') {
      return;
    }

    const backendUrl = this.config.getOrThrow<string>('BACKEND_INTERNAL_URL');
    const audience = this.config.get<string>('BACKEND_AUDIENCE') ?? backendUrl;
    const backendOrigin = new URL(backendUrl).origin;

    this.httpService.axiosRef.interceptors.request.use(async (requestConfig) => {
      // Guard by the actual connection target's origin (always backendUrl's
      // origin, by construction -- every current caller builds its URL from
      // BACKEND_INTERNAL_URL), not by audience, which may legitimately
      // differ from it (e.g. a private DNS alias vs. the run.app URL Cloud
      // Run's IAM layer expects in the token's aud claim). Every HttpService
      // in this app happens to only call the backend today, but this keeps
      // that an enforced invariant rather than an assumption -- a future
      // third-party integration built on the same shared axios instance
      // won't silently leak this token to an external host.
      //
      // Compares parsed origins, not raw string prefixes: a naive
      // `url.startsWith(backendUrl)` would incorrectly match an attacker
      // host like "https://backend.internal.attacker.example" against a
      // backendUrl of "https://backend.internal" (CodeRabbit finding,
      // review of #166).
      if (!requestConfig.url) {
        return requestConfig;
      }

      const requestOrigin = new URL(requestConfig.url, requestConfig.baseURL).origin;
      if (requestOrigin !== backendOrigin) {
        return requestConfig;
      }

      requestConfig.headers.set(
        'Authorization',
        await this.tokenProvider.getAuthorizationHeader(audience),
      );
      return requestConfig;
    });
  }
}
