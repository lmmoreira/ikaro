import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { AuthController } from './auth.controller';
import { AuthControllerFlowService } from './auth-controller-flow.service';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { GoogleCallbackGuard } from './guards/google-callback.guard';
import { JwtIssuerService } from './jwt-issuer.service';
import { OAuthStateService } from './oauth-state.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ session: false }),
    JwtModule.registerAsync({
      global: true,
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN') as StringValue },
      }),
      inject: [ConfigService],
    }),
    BackendHttpModule,
  ],
  controllers: [AuthController],
  providers: [
    GoogleStrategy,
    JwtStrategy,
    JwtIssuerService,
    OAuthStateService,
    GoogleAuthGuard,
    GoogleCallbackGuard,
    AuthControllerFlowService,
  ],
  exports: [JwtIssuerService],
})
export class AuthModule {}
