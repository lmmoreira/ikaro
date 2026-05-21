import { Money } from '../../../shared/value-objects/money';
import { BookingDomainError, ServiceDeactivatedError } from './errors/booking-domain.error';
import { Service } from './service.aggregate';

const TENANT = 'tenant-abc';
const PRICE = Money.from(150, 'BRL');
const DURATION = 60;
const POINTS = 10;

function makeService(overrides?: Partial<Parameters<typeof Service.create>>) {
  return Service.create(
    overrides?.[0] ?? TENANT,
    overrides?.[1] ?? 'Lavagem Completa',
    overrides?.[2] ?? PRICE,
    overrides?.[3] ?? DURATION,
    overrides?.[4] ?? POINTS,
    overrides?.[5] ?? false,
    overrides?.[6] ?? 'Descrição',
  );
}

describe('Service', () => {
  describe('create()', () => {
    it('creates an active service with correct properties', () => {
      const service = makeService();
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
      const service = Service.create(TENANT, 'Lavagem', PRICE, DURATION, POINTS);
      expect(service.requiresPickupAddress).toBe(false);
    });

    it('defaults description to null when omitted', () => {
      const service = Service.create(TENANT, 'Lavagem', PRICE, DURATION, POINTS);
      expect(service.description).toBeNull();
    });

    it('trims whitespace from name', () => {
      const service = Service.create(TENANT, '  Lavagem Completa  ', PRICE, DURATION, POINTS);
      expect(service.name).toBe('Lavagem Completa');
    });

    it('price.format() returns pt-BR formatted string', () => {
      const service = makeService();
      expect(service.price.format()).toBe('R$ 150,00');
    });

    it('stores no domain events on creation', () => {
      const service = makeService();
      expect(service.clearDomainEvents()).toHaveLength(0);
    });

    it('throws when tenantId is empty', () => {
      expect(() => Service.create('', 'Lavagem', PRICE, DURATION, POINTS)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when name is empty', () => {
      expect(() => Service.create(TENANT, '', PRICE, DURATION, POINTS)).toThrow(BookingDomainError);
    });

    it('throws when name is whitespace-only', () => {
      expect(() => Service.create(TENANT, '   ', PRICE, DURATION, POINTS)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when price amount is zero', () => {
      expect(() => Service.create(TENANT, 'Lavagem', Money.from(0), DURATION, POINTS)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when price amount is negative', () => {
      expect(() =>
        Service.create(TENANT, 'Lavagem', Money.from(-10, 'BRL'), DURATION, POINTS),
      ).toThrow(BookingDomainError);
    });

    it('throws when durationMinutes is zero', () => {
      expect(() => Service.create(TENANT, 'Lavagem', PRICE, 0, POINTS)).toThrow(BookingDomainError);
    });

    it('throws when durationMinutes is negative', () => {
      expect(() => Service.create(TENANT, 'Lavagem', PRICE, -5, POINTS)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when loyaltyPointsValue is negative', () => {
      expect(() => Service.create(TENANT, 'Lavagem', PRICE, DURATION, -1)).toThrow(
        BookingDomainError,
      );
    });

    it('allows loyaltyPointsValue of zero', () => {
      const service = Service.create(TENANT, 'Lavagem', PRICE, DURATION, 0);
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
    it('updates all mutable fields', () => {
      const service = makeService();
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
      const service = makeService();
      const before = service.updatedAt;
      service.update('Novo Nome', null, PRICE, DURATION, POINTS, false);
      expect(service.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('accepts null description to clear it', () => {
      const service = makeService();
      service.update('Lavagem', null, PRICE, DURATION, POINTS, false);
      expect(service.description).toBeNull();
    });

    it('throws ServiceDeactivatedError when service is inactive', () => {
      const service = makeService();
      service.deactivate();
      expect(() => service.update('Novo Nome', null, PRICE, DURATION, POINTS, false)).toThrow(
        ServiceDeactivatedError,
      );
    });

    it('throws when updated name is empty', () => {
      const service = makeService();
      expect(() => service.update('', null, PRICE, DURATION, POINTS, false)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when updated price is zero', () => {
      const service = makeService();
      expect(() => service.update('Lavagem', null, Money.from(0), DURATION, POINTS, false)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when updated durationMinutes is zero', () => {
      const service = makeService();
      expect(() => service.update('Lavagem', null, PRICE, 0, POINTS, false)).toThrow(
        BookingDomainError,
      );
    });

    it('throws when updated loyaltyPointsValue is negative', () => {
      const service = makeService();
      expect(() => service.update('Lavagem', null, PRICE, DURATION, -1, false)).toThrow(
        BookingDomainError,
      );
    });
  });

  describe('deactivate()', () => {
    it('sets isActive to false', () => {
      const service = makeService();
      service.deactivate();
      expect(service.isActive).toBe(false);
    });

    it('updates updatedAt timestamp', () => {
      const service = makeService();
      const before = service.updatedAt;
      service.deactivate();
      expect(service.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('does not emit domain events', () => {
      const service = makeService();
      service.deactivate();
      expect(service.clearDomainEvents()).toHaveLength(0);
    });
  });
});
