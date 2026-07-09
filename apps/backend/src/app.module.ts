import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { EVENT_BUS } from './shared/ports/event-bus.port';
import { PUSHABLE_EVENT_BUS } from './shared/ports/pushable-event-bus.port';

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
    // Token-to-token alias (not the useExisting-adapter-token anti-pattern from CLAUDE.md §8 —
    // that's about `{ provide: TOKEN, useExisting: SomeClass }` where SomeClass is *also* a bare
    // provider, double-instantiating it). This aliases PUSHABLE_EVENT_BUS to whatever EVENT_BUS
    // resolves to — same singleton, and it correctly follows EVENT_BUS overrides in tests too.
    { provide: PUSHABLE_EVENT_BUS, useExisting: EVENT_BUS },
  ],
})
export class AppModule {}
