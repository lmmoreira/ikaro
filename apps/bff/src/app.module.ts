import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { ServicesModule } from './services/services.module';
import { StaffModule } from './staff/staff.module';
import { UploadsModule } from './uploads/uploads.module';
import { ActiveStaffGuard } from './shared/guards/active-staff.guard';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { TenantGuard } from './shared/guards/tenant.guard';
import { RolesGuard } from './shared/guards/roles.guard';
import { CorrelationInterceptor } from './shared/interceptors/correlation.interceptor';
import { ErrorInterceptor } from './shared/interceptors/error.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    HttpModule,
    ThrottlerModule.forRoot([
      {
        name: 'public',
        ttl: 60000,
        limit: 60,
      },
      {
        name: 'authenticated',
        ttl: 60000,
        limit: 300,
      },
    ]),
    AuthModule,
    ServicesModule,
    StaffModule,
    UploadsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: CorrelationInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ErrorInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ActiveStaffGuard },
  ],
})
export class AppModule {}
