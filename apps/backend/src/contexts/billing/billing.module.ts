import { Module } from '@nestjs/common';

// Billing context (Ikaro charging its tenants). Empty on purpose in M25-S03: the persistence
// foundation (schema + tables) lands first; each aggregate story registers its own repositories,
// use cases and controllers here.
@Module({})
export class BillingModule {}
