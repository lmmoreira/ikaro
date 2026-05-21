import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingModule } from './contexts/booking/booking.module';
import { CustomerModule } from './contexts/customer/customer.module';
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
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env['DB_HOST'],
        port: Number(process.env['DB_PORT'] ?? 5432),
        username: process.env['DB_USER'],
        password: process.env['DB_PASSWORD'],
        database: process.env['DB_NAME'],
        synchronize: false,
        migrationsRun: false,
        entities: [__dirname + '/contexts/**/infrastructure/entities/*.entity{.ts,.js}'],
      }),
    }),
    EventBusModule,
    TransactionManagerModule,
    TenantModule,
    PlatformModule,
    BookingModule,
    CustomerModule,
    StaffModule,
    NotificationModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: TenantInterceptor }],
})
export class AppModule {}
