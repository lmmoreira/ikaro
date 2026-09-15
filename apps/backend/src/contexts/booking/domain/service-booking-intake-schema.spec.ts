import { ServiceBookingIntakeSchema } from './service-booking-intake-schema';

const TENANT = 'tenant-abc';
const SERVICE_ID = 'service-1';

function publishInput(
  overrides: Partial<Parameters<typeof ServiceBookingIntakeSchema.publish>[0]> = {},
) {
  return {
    tenantId: TENANT,
    serviceId: SERVICE_ID,
    previousVersion: 0,
    questions: [
      {
        fieldKey: 'accessNeeds',
        label: 'Necessidades de acesso',
        type: 'FREE_TEXT' as const,
        required: false,
      },
    ],
    consentText: 'Concordo com os termos',
    requiresNamedAttendees: false,
    participantCountRequired: false,
    ...overrides,
  };
}

describe('ServiceBookingIntakeSchema', () => {
  describe('publish()', () => {
    it('starts at version 1 when there is no previous version', () => {
      const schema = ServiceBookingIntakeSchema.publish(publishInput({ previousVersion: 0 }));
      expect(schema.version).toBe(1);
      expect(schema.consentVersion).toBe(1);
      expect(schema.isActive).toBe(true);
    });

    it('increments from the previous version', () => {
      const schema = ServiceBookingIntakeSchema.publish(publishInput({ previousVersion: 3 }));
      expect(schema.version).toBe(4);
      expect(schema.consentVersion).toBe(4);
    });

    it('assigns a fresh id per published version', () => {
      const first = ServiceBookingIntakeSchema.publish(publishInput());
      const second = ServiceBookingIntakeSchema.publish(publishInput({ previousVersion: 1 }));
      expect(first.id).not.toBe(second.id);
    });

    it('copies the given questions/consent/participant fields', () => {
      const schema = ServiceBookingIntakeSchema.publish(
        publishInput({
          consentText: 'Texto de consentimento',
          requiresNamedAttendees: true,
          participantCountRequired: true,
        }),
      );
      expect(schema.consentText).toBe('Texto de consentimento');
      expect(schema.requiresNamedAttendees).toBe(true);
      expect(schema.participantCountRequired).toBe(true);
      expect(schema.questions).toHaveLength(1);
    });
  });

  describe('hasPickupAddressQuestion', () => {
    it('is true when a PICKUP_ADDRESS-typed question is present (UC-054 A2)', () => {
      const schema = ServiceBookingIntakeSchema.publish(
        publishInput({
          questions: [
            {
              fieldKey: 'pickup',
              label: 'Endereço de coleta',
              type: 'PICKUP_ADDRESS',
              required: true,
            },
          ],
        }),
      );
      expect(schema.hasPickupAddressQuestion).toBe(true);
    });

    it('is false when no question is PICKUP_ADDRESS-typed', () => {
      const schema = ServiceBookingIntakeSchema.publish(publishInput());
      expect(schema.hasPickupAddressQuestion).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('restores an already-persisted schema as-is', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const schema = ServiceBookingIntakeSchema.reconstitute({
        id: 'schema-1',
        tenantId: TENANT,
        serviceId: SERVICE_ID,
        version: 2,
        questions: [],
        consentText: 'Texto',
        consentVersion: 2,
        requiresNamedAttendees: false,
        participantCountRequired: false,
        isActive: false,
        createdAt,
      });
      expect(schema.version).toBe(2);
      expect(schema.isActive).toBe(false);
      expect(schema.createdAt).toBe(createdAt);
    });
  });
});
