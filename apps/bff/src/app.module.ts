import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health/health.controller';
import { AuthModule } from './auth/auth.module';
import { UploadsModule } from './uploads/uploads.module';
import { CorrelationInterceptor } from './shared/interceptors/correlation.interceptor';
import { ErrorInterceptor } from './shared/interceptors/error.interceptor';

@Module({
  imports: [
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
    UploadsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: CorrelationInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ErrorInterceptor },
  ],
})
export class AppModule {}
