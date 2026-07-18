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
    if (this.config.get<string>('BACKEND_AUTH_MODE', 'none') !== 'iam') {
      return;
    }

    const audience =
      this.config.get<string>('BACKEND_AUDIENCE') ??
      this.config.getOrThrow<string>('BACKEND_INTERNAL_URL');

    this.httpService.axiosRef.interceptors.request.use(async (requestConfig) => {
      requestConfig.headers.set(
        'Authorization',
        await this.tokenProvider.getAuthorizationHeader(audience),
      );
      return requestConfig;
    });
  }
}
