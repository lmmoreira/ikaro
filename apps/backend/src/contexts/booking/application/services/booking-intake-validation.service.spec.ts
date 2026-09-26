import { InMemoryServiceIntakeSchemaRepository } from '../../../../test/repositories/booking/in-memory-service-intake-schema.repository';
import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';
import { BookingIntakeAnswerMissingError } from '../../domain/errors/booking-domain.error';
import { BookingIntakeValidationService } from './booking-intake-validation.service';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000099';
const SERVICE_ID = '00000000-0000-7000-8000-000000000002';

describe('BookingIntakeValidationService', () => {
  let repo: InMemoryServiceIntakeSchemaRepository;
  let service: BookingIntakeValidationService;

  beforeEach(() => {
    repo = new InMemoryServiceIntakeSchemaRepository();
    service = new BookingIntakeValidationService(repo);
  });

  it('returns null intake and no attendees when the service has no active schema', async () => {
    const result = await service.resolve(SERVICE_ID, TENANT_ID, {
      intakeAnswers: { anything: 'x' },
      consentAccepted: true,
    });

    expect(result).toEqual({ intake: null, attendeeInputs: [] });
  });

  it("never resolves another tenant's schema for the same serviceId (tenant isolation)", async () => {
    const schema = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [{ fieldKey: 'vehiclePlate', label: 'Placa', type: 'FREE_TEXT', required: true }],
      consentText: 'Aceito os termos',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });
    await repo.publish(schema);

    const result = await service.resolve(SERVICE_ID, OTHER_TENANT_ID, {
      intakeAnswers: { anything: 'x' },
      consentAccepted: true,
    });

    expect(result).toEqual({ intake: null, attendeeInputs: [] });
  });

  it('snapshots the active schema version, answers, and consent when all required fields are present', async () => {
    const schema = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [{ fieldKey: 'vehiclePlate', label: 'Placa', type: 'FREE_TEXT', required: true }],
      consentText: 'Aceito os termos',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });
    await repo.publish(schema);

    const result = await service.resolve(SERVICE_ID, TENANT_ID, {
      intakeAnswers: { vehiclePlate: 'ABC1D23' },
      consentAccepted: true,
    });

    expect(result.intake).toEqual({
      intakeSchemaVersion: schema.version,
      intakeAnswers: { vehiclePlate: 'ABC1D23' },
      consentAcceptedAt: expect.any(Date),
      consentVersion: schema.consentVersion,
    });
    expect(result.attendeeInputs).toEqual([]);
  });

  it('throws naming the missing field(s) when a required question is unanswered', async () => {
    const schema = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [{ fieldKey: 'vehiclePlate', label: 'Placa', type: 'FREE_TEXT', required: true }],
      consentText: 'Aceito os termos',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });
    await repo.publish(schema);

    await expect(
      service.resolve(SERVICE_ID, TENANT_ID, { intakeAnswers: {}, consentAccepted: true }),
    ).rejects.toThrow(BookingIntakeAnswerMissingError);
  });

  it('throws when a BOOLEAN question receives a string answer', async () => {
    const schema = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [{ fieldKey: 'hasAllergy', label: 'Alergia?', type: 'BOOLEAN', required: true }],
      consentText: 'Aceito os termos',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });
    await repo.publish(schema);

    await expect(
      service.resolve(SERVICE_ID, TENANT_ID, {
        intakeAnswers: { hasAllergy: 'yes' },
        consentAccepted: true,
      }),
    ).rejects.toThrow(BookingIntakeAnswerMissingError);
  });

  it('throws when a FREE_TEXT question receives a boolean answer', async () => {
    const schema = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [{ fieldKey: 'vehiclePlate', label: 'Placa', type: 'FREE_TEXT', required: true }],
      consentText: 'Aceito os termos',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });
    await repo.publish(schema);

    await expect(
      service.resolve(SERVICE_ID, TENANT_ID, {
        intakeAnswers: { vehiclePlate: true },
        consentAccepted: true,
      }),
    ).rejects.toThrow(BookingIntakeAnswerMissingError);
  });

  it('accepts a correctly-typed answer for an optional question', async () => {
    const schema = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [{ fieldKey: 'hasAllergy', label: 'Alergia?', type: 'BOOLEAN', required: false }],
      consentText: 'Aceito os termos',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });
    await repo.publish(schema);

    const result = await service.resolve(SERVICE_ID, TENANT_ID, {
      intakeAnswers: { hasAllergy: false },
      consentAccepted: true,
    });

    expect(result.intake?.intakeAnswers).toEqual({ hasAllergy: false });
  });

  it('throws when consent is not accepted', async () => {
    const schema = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [],
      consentText: 'Aceito os termos',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });
    await repo.publish(schema);

    await expect(
      service.resolve(SERVICE_ID, TENANT_ID, { intakeAnswers: {}, consentAccepted: false }),
    ).rejects.toThrow(BookingIntakeAnswerMissingError);
  });

  it('throws when participantCountRequired is true and participantCount is missing', async () => {
    const schema = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [],
      consentText: 'Aceito os termos',
      requiresNamedAttendees: false,
      participantCountRequired: true,
    });
    await repo.publish(schema);

    await expect(
      service.resolve(SERVICE_ID, TENANT_ID, { intakeAnswers: {}, consentAccepted: true }),
    ).rejects.toThrow(BookingIntakeAnswerMissingError);
  });

  it('accepts named attendees only when requiresNamedAttendees is true', async () => {
    const schema = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [],
      consentText: 'Aceito os termos',
      requiresNamedAttendees: true,
      participantCountRequired: false,
    });
    await repo.publish(schema);

    const result = await service.resolve(SERVICE_ID, TENANT_ID, {
      intakeAnswers: {},
      consentAccepted: true,
      attendees: [{ name: 'Maria Silva' }],
    });

    expect(result.attendeeInputs).toEqual([{ name: 'Maria Silva' }]);
  });

  it('validates against an explicitly-displayed prior version rather than rejecting solely for "not the latest" (UC-068 A1)', async () => {
    const v1 = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [{ fieldKey: 'oldQuestion', label: 'Old', type: 'FREE_TEXT', required: true }],
      consentText: 'v1',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });
    await repo.publish(v1);
    const v2 = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: v1.version,
      questions: [{ fieldKey: 'newQuestion', label: 'New', type: 'FREE_TEXT', required: true }],
      consentText: 'v2',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });
    await repo.publish(v2);

    // Client displayed v1 and submits answers matching v1's own question, not v2's.
    const result = await service.resolve(SERVICE_ID, TENANT_ID, {
      intakeSchemaVersion: v1.version,
      intakeAnswers: { oldQuestion: 'answer' },
      consentAccepted: true,
    });

    expect(result.intake?.intakeSchemaVersion).toBe(v1.version);
  });

  it('throws when the submitted intakeSchemaVersion never existed for this service', async () => {
    const schema = ServiceBookingIntakeSchema.publish({
      tenantId: TENANT_ID,
      serviceId: SERVICE_ID,
      previousVersion: 0,
      questions: [],
      consentText: 'v1',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });
    await repo.publish(schema);

    await expect(
      service.resolve(SERVICE_ID, TENANT_ID, {
        intakeSchemaVersion: 999,
        intakeAnswers: {},
        consentAccepted: true,
      }),
    ).rejects.toThrow(BookingIntakeAnswerMissingError);
  });
});
