import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BackendAuthInterceptor } from './backend-auth.interceptor';
import { BackendHttpService } from './backend-http.service';
import { GoogleIdentityTokenProvider } from './google-identity-token.adapter';
import { IDENTITY_TOKEN_PROVIDER } from './identity-token-provider.port';

@Module({
  imports: [HttpModule],
  providers: [
    BackendHttpService,
    { provide: IDENTITY_TOKEN_PROVIDER, useClass: GoogleIdentityTokenProvider },
    BackendAuthInterceptor,
  ],
  exports: [BackendHttpService],
})
export class BackendHttpModule {}
