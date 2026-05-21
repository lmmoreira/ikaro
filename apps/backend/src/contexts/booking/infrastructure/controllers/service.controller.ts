import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { CreateServiceDto, CreateServiceSchema } from '../../application/dtos/create-service.dto';
import {
  CreateServiceUseCase,
  CreateServiceUseCaseResult,
} from '../../application/use-cases/create-service.use-case';
import { StaffOrManagerRoleGuard } from '../guards/staff-or-manager-role.guard';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('services')
export class ServiceController {
  constructor(private readonly createService: CreateServiceUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(StaffOrManagerRoleGuard)
  create(
    @Body(new ZodValidationPipe(CreateServiceSchema)) body: CreateServiceDto,
  ): Promise<CreateServiceUseCaseResult> {
    return this.createService.execute(body).catch(mapBookingError);
  }
}
