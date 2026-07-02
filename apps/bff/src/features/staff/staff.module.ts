import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { StaffController } from './staff.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [StaffController],
})
export class StaffModule {}
