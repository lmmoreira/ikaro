import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SERVICE_REPOSITORY } from './application/ports/service-repository.port';
import { ServiceEntity } from './infrastructure/entities/service.entity';
import { TypeOrmServiceRepository } from './infrastructure/repositories/typeorm-service.repository';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceEntity])],
  providers: [{ provide: SERVICE_REPOSITORY, useClass: TypeOrmServiceRepository }],
  exports: [SERVICE_REPOSITORY],
})
export class BookingModule {}
