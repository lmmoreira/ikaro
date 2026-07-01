import { Money } from '../../../shared/value-objects/money';
import { ServiceBuilder } from '../../../test/builders/booking/index';
import { BookingDomainError, ServiceDeactivatedError } from './errors/booking-domain.error';
import { Service } from './service.aggregate';

const TENANT = 'tenant-abc';
const PRICE = Money.from(150, 'BRL');
const DURATION = 60;
const POINTS = 10;

describe('Service', () => {
  describe('create()', () => {
    it('creates an active service with correct properties', () => {
      const service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withName('Lavagem Completa')
        .withPrice(PRICE)
        .withDurationMinutes(DURATION)
        .withLoyaltyPointsValue(POINTS)
        .withDescription('Descrição')
        .build();

      expect(service.id).toBeDefined();
      expect(service.tenantId).toBe(TENANT);
      expect(service.name).toBe('Lavagem Completa');
      expect(service.description).toBe('Descrição');
      expect(service.price).toBeInstanceOf(Money);
      expect(service.price.amount.toNumber()).toBe(150);
      expect(service.durationMinutes).toBe(60);
      expect(service.loyaltyPointsValue).toBe(10);
      expect(service.requiresPickupAddress).toBe(false);
      expect(service.isActive).toBe(true);
      expect(service.createdAt).toBeInstanceOf(Date);
      expect(service.updatedAt).toBeInstanceOf(Date);
    });

    it('defaults requiresPickupAddress to false when omitted', () => {
      const service = Service.create({
        tenantId: TENANT,
        name: 'Lavagem',
        price: PRICE,
        durationMinutes: DURATION,
        loyaltyPointsValue: POINTS,
      });
      expect(service.requiresPickupAddress).toBe(false);
    });

    it('defaults description to null when omitted', () => {
      const service = Service.create({
        tenantId: TENANT,
        name: 'Lavagem',
        price: PRICE,
        durationMinutes: DURATION,
        loyaltyPointsValue: POINTS,
      });
      expect(service.description).toBeNull();
    });

    it('trims whitespace from name', () => {
      const service = Service.create({
        tenantId: TENANT,
        name: '  Lavagem Completa  ',
        price: PRICE,
        durationMinutes: DURATION,
        loyaltyPointsValue: POINTS,
      });
      expect(service.name).toBe('Lavagem Completa');
    });

    it('price.format() returns pt-BR formatted string', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).withPrice(PRICE).build();
      expect(service.price.format('pt-BR')).toBe('R$\u00A0150,00');
    });

    it('stores no domain events on creation', () => {
      const service = new ServiceBuilder().withTenantId(TENANT).build();
      expect(service.clearDomainEvents()).toHaveLength(0);
    });

    it('throws when tenantId is empty', () => {
      expect(() =>
        Service.create({
          tenantId: '',
          name: 'Lavagem',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when name is empty', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: '',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when name is whitespace-only', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: '   ',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when price amount is zero', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Lavagem',
          price: Money.from(0, 'BRL'),
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when price amount is negative', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Lavagem',
          price: Money.from(-10, 'BRL'),
          durationMinutes: DURATION,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when durationMinutes is zero', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Lavagem',
          price: PRICE,
          durationMinutes: 0,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when durationMinutes is negative', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Lavagem',
          price: PRICE,
          durationMinutes: -5,
          loyaltyPointsValue: POINTS,
        }),
      ).toThrow(BookingDomainError);
    });

    it('throws when loyaltyPointsValue is negative', () => {
      expect(() =>
        Service.create({
          tenantId: TENANT,
          name: 'Lavagem',
          price: PRICE,
          durationMinutes: DURATION,
          loyaltyPointsValue: -1,
        }),
      ).toThrow(BookingDomainError);
    });

    it('allows loyaltyPointsValue of zero', () => {
      const service = Service.create({
        tenantId: TENANT,
        name: 'Lavagem',
        price: PRICE,
        durationMinutes: DURATION,
        loyaltyPointsValue: 0,
      });
      expect(service.loyaltyPointsValue).toBe(0);
    });
  });

  describe('reconstitute()', () => {
    it('reconstructs aggregate without validation', () => {
      const now = new Date();
      const service = Service.reconstitute({
        id: 'some-id',
        tenantId: TENANT,
        name: 'Lavagem',
        description: null,
        price: PRICE,
        durationMinutes: 30,
        loyaltyPointsValue: 5,
        requiresPickupAddress: true,
        isActive: false,
        createdAt: now,
        updatedAt: now,
      });
      expect(service.id).toBe('some-id');
      expect(service.isActive).toBe(false);
      expect(service.requiresPickupAddress).toBe(true);
    });
  });

  describe('update()', () => {
    let service: Service;

    beforeEach(() => {
      service = new ServiceBuilder()
        .withTenantId(TENANT)
        .withName('Lavagem Completa')
        .withPrice(PRICE)
        .withDurationMinutes(DURATION)
        .withLoyaltyPointsValue(POINTS)
        .withDescription('Descrição')
        .build();
    });

    it('updates all mutable fields', () => {
      const newPrice = Money.from(200, 'BRL');
      service.update('Lavagem Premium', 'Nova desc', newPrice, 90, 20, true);
      expect(service.name).toBe('Lavagem Premium');
      expect(service.description).toBe('Nova desc');
      expect(service.price.amount.toNumber()).toBe(200);
      expect(service.durationMinutes).toBe(90);
      expect(service.loyaltyPointsValue).toBe(20);
      expect(service.requiresPickupAddress).toBe(true);
    });

    it('updates updatedAt timestamp', () => {
      const before = service.updatedAt;
      service.update('Novo Nome', null, PRICE, DURATION, POINTS, false);
      expect(service.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('accepts null description to clear it', () => {
      service.update('Lavagem', null, PRICE, DURATION, POINTS, false);
      expect(service.description).toBeNull();
    });

    it('throws ServiceDeactivatedError when service is inactive', () => {
      service.deactivate();
      expect(() => service.update('Novo Nome', null, PRICE, DURATION, POINTS, false)).toThrow(
        ServiceDeactivatedError,
      );
    });

    it('throws when updated name is empty', () => {
      expect(() => service.update('', null, PRICE, DURATION, POINTS, false)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when updated price is zero', () => {
      expect(() =>
        service.update('Lavagem', null, Money.from(0, 'BRL'), DURATION, POINTS, false),
      ).toThrow(BookingDomainError);
    });

    it('throws when updated durationMinutes is zero', () => {
      expect(() => service.update('Lavagem', null, PRICE, 0, POINTS, false)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when updated loyaltyPointsValue is negative', () => {
      expect(() => service.update('Lavagem', null, PRICE, DURATION, -1, false)).toThrow(
        BookingDomainError,
      );
    });
  });

  describe('deactivate()', () => {
    let service: Service;

    beforeEach(() => {
      service = new ServiceBuilder().withTenantId(TENANT).build();
    });

    it('sets isActive to false', () => {
      service.deactivate();
      expect(service.isActive).toBe(false);
    });

    it('updates updatedAt timestamp', () => {
      const before = service.updatedAt;
      service.deactivate();
      expect(service.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('does not emit domain events', () => {
      service.deactivate();
      expect(service.clearDomainEvents()).toHaveLength(0);
    });
  });
});
