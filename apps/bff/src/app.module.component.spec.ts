import { APP_GUARD } from '@nestjs/core';
import { AppModule } from './app.module';
import { ActiveStaffGuard } from './shared/guards/active-staff.guard';
import { AppThrottlerGuard } from './shared/guards/app-throttler.guard';
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard';
import { RolesGuard } from './shared/guards/roles.guard';
import { TenantGuard } from './shared/guards/tenant.guard';
import { WebOnlyGuard } from './shared/guards/web-only.guard';

// A component spec on purpose: importing `AppModule` runs `ConfigModule.forRoot({ validate })` at
// import time, which needs the BFF env that only the component suite provides (the unit suite has
// none, and fails to load this file).
describe('AppModule guard chain', () => {
  it('registers the guards in this order, with no tenant-access guard (the backend is the only enforcement point; Nest runs APP_GUARD in registration order)', () => {
    const providers: { provide?: unknown; useClass?: unknown }[] = Reflect.getMetadata(
      'providers',
      AppModule,
    );
    const chain = providers.filter((p) => p.provide === APP_GUARD).map((p) => p.useClass);

    expect(chain).toEqual([
      WebOnlyGuard,
      AppThrottlerGuard,
      JwtAuthGuard,
      TenantGuard,
      RolesGuard,
      ActiveStaffGuard,
    ]);
  });
});
