import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { EventBusModule } from './shared/infrastructure/event-bus/event-bus.module';
import { InboxModule } from './shared/infrastructure/inbox/inbox.module';
import { OutboxModule } from './shared/infrastructure/outbox/outbox.module';
import { TransactionManagerModule } from './shared/infrastructure/transaction-manager.module';
import { InternalApiGuard } from './shared/guards/internal-api.guard';
import { PubSubPushGuard } from './shared/guards/pubsub-push.guard';
import { RequestInterceptor } from './shared/request/request.interceptor';
import { RequestModule } from './shared/request/request.module';
import { CorrelationMiddleware } from './shared/request/correlation.middleware';
import { ErrorFilter } from './shared/filters/error.filter';
import { validateEnv } from './config/env.validation';
import { PubSubPushController } from './shared/infrastructure/event-bus/pubsub-push.controller';
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
        poolSize: config.get<number>('DB_POOL_SIZE', 10),
        synchronize: false,
        migrationsRun: false,
        entities: [
          __dirname + '/contexts/**/infrastructure/entities/*.entity{.ts,.js}',
          // shared/infrastructure/ entities (e.g. outbox/outbox-event.entity.ts, TD24-S01) live
          // outside contexts/** — a separate glob is required or they silently fail to load.
          __dirname + '/shared/infrastructure/**/*.entity{.ts,.js}',
        ],
      }),
      inject: [ConfigService],
    }),
    TerminusModule,
    EventBusModule,
    OutboxModule,
    InboxModule,
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
    { provide: APP_FILTER, useClass: ErrorFilter },
    { provide: APP_GUARD, useClass: InternalApiGuard },
    { provide: OIDC_TOKEN_VERIFIER, useClass: GoogleOidcTokenVerifier },
    PubSubPushGuard,
  ],
})
export class AppModule implements NestModule {
  // CorrelationMiddleware must run before Guards (see its own comment) — registering it
  // here via MiddlewareConsumer, not app.use() in main.ts, is what makes it apply
  // automatically to every test app built via Test.createTestingModule({ imports: [AppModule] })
  // too, the same way APP_GUARD/APP_INTERCEPTOR/APP_FILTER providers already do.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
