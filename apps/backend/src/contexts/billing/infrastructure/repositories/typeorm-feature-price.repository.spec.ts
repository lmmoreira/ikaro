import { In, Repository } from 'typeorm';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import {
  FeaturePriceEntityBuilder,
  FeaturePriceVersionEntityBuilder,
} from '../../../../test/builders/billing';
import { FeaturePrice } from '../../domain/feature-price.aggregate';
import { FeaturePriceVersionEntity } from '../entities/feature-price-version.entity';
import { FeaturePriceEntity } from '../entities/feature-price.entity';
import { TypeOrmFeaturePriceRepository } from './typeorm-feature-price.repository';

describe('TypeOrmFeaturePriceRepository', () => {
  let priceRepo: jest.Mocked<Repository<FeaturePriceEntity>>;
  let versionRepo: jest.Mocked<Repository<FeaturePriceVersionEntity>>;
  let repo: TypeOrmFeaturePriceRepository;

  const BR = CountryCode.create('BR');

  beforeEach(() => {
    priceRepo = { findOne: jest.fn(), find: jest.fn() } as unknown as jest.Mocked<
      Repository<FeaturePriceEntity>
    >;
    versionRepo = { find: jest.fn() } as unknown as jest.Mocked<
      Repository<FeaturePriceVersionEntity>
    >;
    repo = new TypeOrmFeaturePriceRepository(priceRepo, versionRepo);
  });

  describe('findByNaturalKey', () => {
    it('maps the rows to an aggregate, reading the amount in the price currency', async () => {
      const price = new FeaturePriceEntityBuilder().withId('p1').build();
      priceRepo.findOne.mockResolvedValue(price);
      versionRepo.find.mockResolvedValue([
        new FeaturePriceVersionEntityBuilder()
          .withFeaturePriceId('p1')
          .withAmountMinor(4900)
          .build(),
      ]);

      const result = await repo.findByNaturalKey('HOTSITE', BR, 'STANDARD', 'MONTHLY');

      expect(result).toBeInstanceOf(FeaturePrice);
      expect(result!.countryCode.value).toBe('BR');
      expect(result!.versions[0]!.amount.amountMinor).toBe(4900);
      expect(result!.versions[0]!.amount.currency).toBe('BRL');
      expect(result!.versions[0]!.effectiveFrom.value).toBe('2026-01-01');
    });

    it('queries by the natural key only — there is no tenant filter on a platform-wide list', async () => {
      priceRepo.findOne.mockResolvedValue(null);

      await repo.findByNaturalKey('CHATBOT', BR, 'PLUS', 'MONTHLY');

      expect(priceRepo.findOne).toHaveBeenCalledWith({
        where: { featureKey: 'CHATBOT', countryCode: 'BR', tier: 'PLUS', cycle: 'MONTHLY' },
      });
    });

    it('returns null without loading versions when the price does not exist', async () => {
      priceRepo.findOne.mockResolvedValue(null);

      expect(await repo.findByNaturalKey('HOTSITE', BR, 'STANDARD', 'MONTHLY')).toBeNull();
      expect(versionRepo.find).not.toHaveBeenCalled();
    });

    it('trims space-padded CHAR columns', async () => {
      priceRepo.findOne.mockResolvedValue(
        new FeaturePriceEntityBuilder().withCountryCode('BR ').withCurrency('BRL ').build(),
      );
      versionRepo.find.mockResolvedValue([]);

      const result = await repo.findByNaturalKey('HOTSITE', BR, 'STANDARD', 'MONTHLY');

      expect(result!.countryCode.value).toBe('BR');
      expect(result!.currency).toBe('BRL');
    });
  });

  describe('listSelectableByCountry', () => {
    it('loads the versions of all prices in one query and attaches each to its own price', async () => {
      const a = new FeaturePriceEntityBuilder().withId('a').withFeatureKey('HOTSITE').build();
      const b = new FeaturePriceEntityBuilder().withId('b').withFeatureKey('LOYALTY').build();
      priceRepo.find.mockResolvedValue([a, b]);
      versionRepo.find.mockResolvedValue([
        new FeaturePriceVersionEntityBuilder()
          .withFeaturePriceId('a')
          .withAmountMinor(4900)
          .build(),
        new FeaturePriceVersionEntityBuilder()
          .withFeaturePriceId('b')
          .withAmountMinor(2900)
          .build(),
      ]);

      const result = await repo.listSelectableByCountry(BR);

      expect(versionRepo.find).toHaveBeenCalledTimes(1);
      expect(versionRepo.find).toHaveBeenCalledWith({ where: { featurePriceId: In(['a', 'b']) } });
      expect(result.map((price) => price.versions[0]!.amount.amountMinor)).toEqual([4900, 2900]);
    });

    it('filters on selectable = true for the country', async () => {
      priceRepo.find.mockResolvedValue([]);

      await repo.listSelectableByCountry(BR);

      expect(priceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { countryCode: 'BR', selectable: true } }),
      );
    });

    it('skips the version query when the country has no selectable price', async () => {
      priceRepo.find.mockResolvedValue([]);

      expect(await repo.listSelectableByCountry(BR)).toEqual([]);
      expect(versionRepo.find).not.toHaveBeenCalled();
    });
  });
});
