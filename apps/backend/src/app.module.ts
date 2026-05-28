import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import { TenantInterceptor } from './shared/tenant/tenant.interceptor';
import { TenantModule } from './shared/tenant/tenant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    TenantModule,
    PlatformModule,
    BookingModule,
    CustomerModule,
    LoyaltyModule,
    StaffModule,
    NotificationModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
})
export class AppModule {}
