import { Global, Module } from '@nestjs/common';
import { TENANT_ACCESS_PORT } from '../../shared/ports/tenant-access.port';
import { InMemoryTenantAccessPort } from '../infrastructure/in-memory-tenant-access.port';

// BillingModule is @Global() and provides TENANT_ACCESS_PORT to every context. A test app that
// does not import Billing gets this stand-in instead: every tenant operational with every feature,
// unless a spec seeds otherwise (`moduleRef.get(TENANT_ACCESS_PORT)`).
@Global()
@Module({
  providers: [{ provide: TENANT_ACCESS_PORT, useClass: InMemoryTenantAccessPort }],
  exports: [TENANT_ACCESS_PORT],
})
class TestTenantAccessModule {}

export function testTenantAccessModule() {
  return TestTenantAccessModule;
}
