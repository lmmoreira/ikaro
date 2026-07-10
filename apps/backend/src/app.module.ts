import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingModule } from './contexts/booking/booking.module';
import { CustomerModule } from './contexts/customer/customer.module';
import { LoyaltyModule } from './contexts/loyalty/loyalty.module';
import { NotificationModule } from './contexts/notification/notification.module';
import { PlatformModule } from './contexts/platform/platform.module';
import { StaffModule } from './contexts/staff/staff.module';
import { HealthController } from './health/health.controller';
import { EventBusModule } from './shared/infrastructure/event-bus.module';
import { TransactionManagerModule } from './shared/infrastructure/transaction-manager.module';
import { InternalApiGuard } from './shared/guards/internal-api.guard';
import { PubSubPushGuard } from './shared/guards/pubsub-push.guard';
import { RequestInterceptor } from './shared/request/request.interceptor';
import { RequestModule } from './shared/request/request.module';
import { validateEnv } from './config/env.validation';
import { PubSubPushController } from './shared/infrastructure/pubsub-push.controller';
import { GoogleOidcTokenVerifier } from './shared/infrastructure/google-oidc-token-verifier.adapter';
import { OIDC_TOKEN_VERIFIER } from './shared/ports/oidc-token-verifier.port';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    CacheModule.register({
      isGlobal: true,
      ttl: 60_000,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        synchronize: false,
        migrationsRun: false,
        entities: [__dirname + '/contexts/**/infrastructure/entities/*.entity{.ts,.js}'],
      }),
      inject: [ConfigService],
    }),
    TerminusModule,
    EventBusModule,
    TransactionManagerModule,
    RequestModule,
    PlatformModule,
    BookingModule,
    CustomerModule,
    LoyaltyModule,
    StaffModule,
    NotificationModule,
  ],
  controllers: [HealthController, PubSubPushController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: RequestInterceptor },
    { provide: APP_GUARD, useClass: InternalApiGuard },
    { provide: OIDC_TOKEN_VERIFIER, useClass: GoogleOidcTokenVerifier },
    PubSubPushGuard,
  ],
})
export class AppModule {}
