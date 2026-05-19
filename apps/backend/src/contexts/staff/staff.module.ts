import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { STAFF_REPOSITORY } from './application/ports/staff-repository.port';
import { ActivateStaffUseCase } from './application/use-cases/activate-staff.use-case';
import { GetStaffByEmailUseCase } from './application/use-cases/get-staff-by-email.use-case';
import { GetStaffByIdUseCase } from './application/use-cases/get-staff-by-id.use-case';
import { GetStaffByOAuthIdUseCase } from './application/use-cases/get-staff-by-oauth-id.use-case';
import { InviteStaffUseCase } from './application/use-cases/invite-staff.use-case';
import { ListStaffUseCase } from './application/use-cases/list-staff.use-case';
import { InternalStaffController } from './infrastructure/controllers/internal-staff.controller';
import { StaffEntity } from './infrastructure/entities/staff.entity';
import { TypeOrmStaffRepository } from './infrastructure/repositories/typeorm-staff.repository';

@Module({
  imports: [TypeOrmModule.forFeature([StaffEntity])],
  controllers: [InternalStaffController],
  providers: [
    { provide: STAFF_REPOSITORY, useClass: TypeOrmStaffRepository },
    GetStaffByOAuthIdUseCase,
    GetStaffByEmailUseCase,
    ActivateStaffUseCase,
    ListStaffUseCase,
    GetStaffByIdUseCase,
    InviteStaffUseCase,
  ],
})
export class StaffModule {}
