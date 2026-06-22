import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { CreateServiceDto, CreateServiceSchema } from '../../application/dtos/create-service.dto';
import { UpdateServiceDto, UpdateServiceSchema } from '../../application/dtos/update-service.dto';
import {
  CreateServiceUseCase,
  CreateServiceUseCaseResult,
} from '../../application/use-cases/create-service.use-case';
import {
  DeactivateServiceUseCase,
  DeactivateServiceUseCaseResult,
} from '../../application/use-cases/deactivate-service.use-case';
import {
  GetServiceUseCase,
  GetServiceUseCaseResult,
} from '../../application/use-cases/get-service.use-case';
import {
  ListServicesUseCase,
  ListServicesUseCaseResult,
} from '../../application/use-cases/list-services.use-case';
import {
  UpdateServiceUseCase,
  UpdateServiceUseCaseResult,
} from '../../application/use-cases/update-service.use-case';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { mapBookingError } from '../http/booking-error.mapper';

@Controller('services')
export class ServiceController {
  constructor(
    private readonly createService: CreateServiceUseCase,
    private readonly listServices: ListServicesUseCase,
    private readonly getService: GetServiceUseCase,
    private readonly updateService: UpdateServiceUseCase,
    private readonly deactivateService: DeactivateServiceUseCase,
  ) {}

  @Get()
  list(): Promise<ListServicesUseCaseResult> {
    return this.listServices.execute().catch(mapBookingError);
  }

  @Get(':id')
  @UseGuards(StaffOrManagerRoleGuard)
  getOne(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
  ): Promise<GetServiceUseCaseResult> {
    return this.getService.execute(id).catch(mapBookingError);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(StaffOrManagerRoleGuard)
  create(
    @Body(new ZodValidationPipe(CreateServiceSchema)) body: CreateServiceDto,
  ): Promise<CreateServiceUseCaseResult> {
    return this.createService.execute(body).catch(mapBookingError);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  update(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
    @Body(new ZodValidationPipe(UpdateServiceSchema)) body: UpdateServiceDto,
  ): Promise<UpdateServiceUseCaseResult> {
    return this.updateService.execute(id, body).catch(mapBookingError);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  deactivate(
    @Param('id', new ParseUUIDPipe({ errorHttpStatusCode: HttpStatus.BAD_REQUEST })) id: string,
  ): Promise<DeactivateServiceUseCaseResult> {
    return this.deactivateService.execute(id).catch(mapBookingError);
  }
}
