import { Module } from '@nestjs/common';
import { BackendHttpModule } from '../../shared/http/backend-http.module';
import { LoyaltyController } from './loyalty.controller';

@Module({
  imports: [BackendHttpModule],
  controllers: [LoyaltyController],
})
export class LoyaltyModule {}
