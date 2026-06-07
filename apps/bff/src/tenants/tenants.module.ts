import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../shared/http/backend-http.module';
import { TenantsController } from './tenants.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [TenantsController],
})
export class TenantsModule {}
