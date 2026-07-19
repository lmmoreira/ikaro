import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { HealthController } from './health/health.controller';
import { AuthModule } from './features/auth/auth.module';
import { BookingsModule } from './features/booking/bookings.module';
import { CustomersModule } from './features/customer/customers.module';
import { LoyaltyModule } from './features/loyalty/loyalty.module';
import { PlatformModule } from './features/platform/platform.module';
import { ScheduleModule } from './features/booking/schedule.module';
import { BookingServicesModule } from './features/booking/services.module';
import { StaffModule } from './features/staff/staff.module';
import { ActiveStaffGuard } from './shared/guards/active-staff.guard';
import { AppThrottlerGuard } from './shared/guards/app-throttler.guard';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { TenantGuard } from './shared/guards/tenant.guard';
import { RolesGuard } from './shared/guards/roles.guard';
import { CorrelationInterceptor } from './shared/interceptors/correlation.interceptor';
import { ErrorFilter } from './shared/filters/error.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    HttpModule,
    // Single per-IP default tier (M17-S30, simplified 2026-07-18) — no separate
    // authenticated/JWT-sub tier; identity-keyed limiting was dropped as unneeded
    // complexity at this project's MVP scale. Tighter per-route tiers are set via
    // @Throttle({ default: { limit, ttl } }) overrides where needed.
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
    AuthModule,
    BookingsModule,
    CustomersModule,
    LoyaltyModule,
    PlatformModule,
    ScheduleModule,
    BookingServicesModule,
    StaffModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: CorrelationInterceptor },
    { provide: APP_FILTER, useClass: ErrorFilter },
    // Runs first (registration order) — rejects over-limit requests before JWT
    // verification/tenant/role checks do any work.
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ActiveStaffGuard },
  ],
})
export class AppModule {}
