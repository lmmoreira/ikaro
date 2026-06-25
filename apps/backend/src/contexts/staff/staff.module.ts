import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestModule } from '../../shared/request/request.module';
import { STAFF_REPOSITORY } from './application/ports/staff-repository.port';
import { LinkGoogleAccountUseCase } from './application/use-cases/link-google-account.use-case';
import { CreateInitialManagerUseCase } from './application/use-cases/create-initial-manager.use-case';
import { DeactivateStaffUseCase } from './application/use-cases/deactivate-staff.use-case';
import { GetStaffByEmailUseCase } from './application/use-cases/get-staff-by-email.use-case';
import { GetStaffByEmailAcrossTenantsUseCase } from './application/use-cases/get-staff-by-email-across-tenants.use-case';
import { GetStaffByIdUseCase } from './application/use-cases/get-staff-by-id.use-case';
import { GetStaffByOAuthIdUseCase } from './application/use-cases/get-staff-by-oauth-id.use-case';
import { InviteStaffUseCase } from './application/use-cases/invite-staff.use-case';
import { ListStaffUseCase } from './application/use-cases/list-staff.use-case';
import { StaffQueryService } from './application/services/staff-query.service';
import { InternalStaffController } from './infrastructure/controllers/internal-staff.controller';
import { StaffController } from './infrastructure/controllers/staff.controller';
import { StaffEntity } from './infrastructure/entities/staff.entity';
import { TenantProvisionedHandler } from './infrastructure/events/tenant-provisioned.handler';
import { TypeOrmStaffRepository } from './infrastructure/repositories/typeorm-staff.repository';

@Module({
  imports: [TypeOrmModule.forFeature([StaffEntity]), RequestModule],
  controllers: [InternalStaffController, StaffController],
  providers: [
    { provide: STAFF_REPOSITORY, useClass: TypeOrmStaffRepository },
    GetStaffByOAuthIdUseCase,
    GetStaffByEmailUseCase,
    GetStaffByEmailAcrossTenantsUseCase,
    LinkGoogleAccountUseCase,
    ListStaffUseCase,
    GetStaffByIdUseCase,
    InviteStaffUseCase,
    DeactivateStaffUseCase,
    CreateInitialManagerUseCase,
    TenantProvisionedHandler,
    StaffQueryService,
  ],
  exports: [GetStaffByIdUseCase, StaffQueryService],
})
export class StaffModule {}
