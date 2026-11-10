import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { FeatureKey } from '@ikaro/validation';
import { In, Repository } from 'typeorm';
import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { IFeaturePriceRepository } from '../../application/ports/feature-price-repository.port';
import {
  FeaturePrice,
  FeaturePriceCycle,
  FeaturePriceVersion,
  FeatureTier,
} from '../../domain/feature-price.aggregate';
import { MinorAmount } from '../../domain/value-objects/minor-amount.vo';
import { FeaturePriceVersionEntity } from '../entities/feature-price-version.entity';
import { FeaturePriceEntity } from '../entities/feature-price.entity';

/**
 * Read-only adapter for the platform-wide price list: no method takes a tenant id, because the
 * list has none (documented exemption). Writes arrive with M26's operator endpoints.
 */
@Injectable()
export class TypeOrmFeaturePriceRepository implements IFeaturePriceRepository {
  constructor(
    @InjectRepository(FeaturePriceEntity)
    private readonly priceRepo: Repository<FeaturePriceEntity>,
    @InjectRepository(FeaturePriceVersionEntity)
    private readonly versionRepo: Repository<FeaturePriceVersionEntity>,
  ) {}

  async findByNaturalKey(
    featureKey: FeatureKey,
    countryCode: CountryCode,
    tier: FeatureTier,
    cycle: FeaturePriceCycle,
  ): Promise<FeaturePrice | null> {
    const entity = await this.priceRepo.findOne({
      where: { featureKey, countryCode: countryCode.value, tier, cycle },
    });
    if (!entity) return null;
    const versions = await this.versionRepo.find({ where: { featurePriceId: entity.id } });
    return this.toDomain(entity, versions);
  }

  async listSelectableByCountry(countryCode: CountryCode): Promise<FeaturePrice[]> {
    const entities = await this.priceRepo.find({
      where: { countryCode: countryCode.value, selectable: true },
      order: { featureKey: 'ASC', tier: 'ASC' },
    });
    if (entities.length === 0) return [];
    const versions = await this.versionRepo.find({
      where: { featurePriceId: In(entities.map((entity) => entity.id)) },
    });
    return entities.map((entity) =>
      this.toDomain(
        entity,
        versions.filter((version) => version.featurePriceId === entity.id),
      ),
    );
  }

  private toDomain(
    entity: FeaturePriceEntity,
    versions: FeaturePriceVersionEntity[],
  ): FeaturePrice {
    // CHAR(n) columns come back space-padded when shorter; these are exactly 2 and 3 wide.
    const currency = entity.currency.trim();
    return FeaturePrice.reconstitute({
      id: entity.id,
      featureKey: entity.featureKey as FeatureKey,
      countryCode: CountryCode.reconstitute(entity.countryCode.trim()),
      tier: entity.tier as FeatureTier,
      cycle: entity.cycle as FeaturePriceCycle,
      currency,
      selectable: entity.selectable,
      versions: versions.map((version) => this.versionToDomain(version, currency)),
    });
  }

  private versionToDomain(
    version: FeaturePriceVersionEntity,
    currency: string,
  ): FeaturePriceVersion {
    return {
      id: version.id,
      amount: MinorAmount.reconstitute(version.amountMinor, currency),
      effectiveFrom: CalendarDate.reconstitute(version.effectiveFrom),
      announcedAt: version.announcedAt,
      createdBy: version.createdBy,
      reason: version.reason,
      supersededAt: version.supersededAt,
      batchId: version.batchId,
    };
  }
}
