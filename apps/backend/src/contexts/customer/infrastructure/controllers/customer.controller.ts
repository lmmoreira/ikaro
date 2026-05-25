import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { mapCustomerError } from '../http/customer-error.mapper';
import {
  UpdateCustomerProfileDto,
  UpdateCustomerProfileSchema,
} from '../../application/dtos/update-customer-profile.dto';
import {
  GetCustomerProfileUseCase,
  GetCustomerProfileUseCaseResult,
} from '../../application/use-cases/get-customer-profile.use-case';
import {
  UpdateCustomerProfileUseCase,
  UpdateCustomerProfileUseCaseResult,
} from '../../application/use-cases/update-customer-profile.use-case';

@Controller('customers')
export class CustomerController {
  constructor(
    private readonly getProfile: GetCustomerProfileUseCase,
    private readonly updateProfile: UpdateCustomerProfileUseCase,
  ) {}

  @Get('me')
  getMe(): Promise<GetCustomerProfileUseCaseResult> {
    return this.getProfile.execute().catch(mapCustomerError);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  updateMe(
    @Body(new ZodValidationPipe(UpdateCustomerProfileSchema)) dto: UpdateCustomerProfileDto,
  ): Promise<UpdateCustomerProfileUseCaseResult> {
    return this.updateProfile.execute(dto).catch(mapCustomerError);
  }
}
