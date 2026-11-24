import { DynamicModule, Module } from '@nestjs/common';
import { AppEnv } from '../../../shared/database/resolve-app-env';
import { BILLING_FAKE_PROVIDER_CONTROL } from '../application/ports/billing-fake-provider-control.port';
import { SimulateProviderEventUseCase } from '../application/use-cases/simulate-provider-event.use-case';
import { FakeBillingProvider } from './providers/fake-billing.provider';
import { InternalDevBillingController } from './controllers/internal-dev-billing.controller';

/**
 * The dev-only billing routes (UC-138). In `production` this is an empty module: no controller, no
 * use case and no `IBillingFakeProviderControl` binding exist, so the route answers 404 and nothing
 * can resolve the control token. `local` and `staging` get all of it. Mirrors `DevClockModule`.
 * The consumers of `BillingModule`'s exports (the charge repository, the fake and the webhook use
 * case) resolve through its `@Global()` registration.
 */
@Module({})
export class DevBillingModule {
  static register(appEnv: AppEnv): DynamicModule {
    if (appEnv === 'production') {
      return { module: DevBillingModule };
    }
    return {
      module: DevBillingModule,
      controllers: [InternalDevBillingController],
      providers: [
        {
          provide: BILLING_FAKE_PROVIDER_CONTROL,
          useFactory: (fake: FakeBillingProvider) => fake,
          inject: [FakeBillingProvider],
        },
        SimulateProviderEventUseCase,
      ],
    };
  }
}
