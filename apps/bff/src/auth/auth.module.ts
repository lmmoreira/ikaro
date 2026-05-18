import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';
import { BackendHttpModule } from '../shared/http/backend-http.module';
import { AuthController } from './auth.controller';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtIssuerService } from './jwt-issuer.service';
import { SelectionTokenService } from './selection-token.service';
import { GoogleStrategy } from './strategies/google.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ session: false }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: process.env['JWT_SECRET'],
        signOptions: { expiresIn: (process.env['JWT_EXPIRES_IN'] ?? '7d') as StringValue },
      }),
    }),
    BackendHttpModule,
  ],
  controllers: [AuthController],
  providers: [
    GoogleStrategy,
    JwtStrategy,
    JwtIssuerService,
    SelectionTokenService,
    GoogleAuthGuard,
  ],
  exports: [JwtIssuerService],
})
export class AuthModule {}
