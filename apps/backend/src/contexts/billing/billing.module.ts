import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FEATURE_PRICE_REPOSITORY } from './application/ports/feature-price-repository.port';
import { GetFeaturePriceAtUseCase } from './application/use-cases/get-feature-price-at.use-case';
import { ListSelectablePricesUseCase } from './application/use-cases/list-selectable-prices.use-case';
import { FeaturePriceVersionEntity } from './infrastructure/entities/feature-price-version.entity';
import { FeaturePriceEntity } from './infrastructure/entities/feature-price.entity';
import { TypeOrmFeaturePriceRepository } from './infrastructure/repositories/typeorm-feature-price.repository';

// Billing context (Ikaro charging its tenants). Each aggregate story registers its own
// repositories, use cases and controllers here. M25-S04: the platform-wide price list (read side).
@Module({
  imports: [TypeOrmModule.forFeature([FeaturePriceEntity, FeaturePriceVersionEntity])],
  providers: [
    { provide: FEATURE_PRICE_REPOSITORY, useClass: TypeOrmFeaturePriceRepository },
    GetFeaturePriceAtUseCase,
    ListSelectablePricesUseCase,
  ],
  // Consumed in-process by M26's charge issuer and price page; export them then, not before.
  exports: [],
})
export class BillingModule {}
