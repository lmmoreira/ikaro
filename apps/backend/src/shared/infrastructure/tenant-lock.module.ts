import { Global, Module } from '@nestjs/common';
import { TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { TypeOrmTenantLockAdapter } from './typeorm-tenant-lock.adapter';

// @Global makes TENANT_LOCK_PORT injectable in every context module without an explicit import,
// mirroring TransactionManagerModule — a generic, domain-agnostic advisory-lock primitive used
// by both booking (schedule openings/closures) and platform (tenant settings), with neither
// context depending on the other.
@Global()
@Module({
  providers: [{ provide: TENANT_LOCK_PORT, useClass: TypeOrmTenantLockAdapter }],
  exports: [TENANT_LOCK_PORT],
})
export class TenantLockModule {}
