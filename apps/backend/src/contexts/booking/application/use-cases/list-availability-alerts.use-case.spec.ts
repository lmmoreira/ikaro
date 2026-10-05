import { AvailabilityAlertBuilder } from '../../../../test/builders/booking/index';
import { InMemoryAvailabilityAlertRepository } from '../../../../test/repositories/booking/in-memory-availability-alert.repository';
import { ListAvailabilityAlertsUseCase } from './list-availability-alerts.use-case';

const TENANT = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '00000000-0000-7000-8000-000000000002';
const CUSTOMER = '00000000-0000-7000-8000-0000000000c1';
const OTHER_CUSTOMER = '00000000-0000-7000-8000-0000000000c2';

describe('ListAvailabilityAlertsUseCase', () => {
  let alertRepo: InMemoryAvailabilityAlertRepository;
  let useCase: ListAvailabilityAlertsUseCase;

  beforeEach(() => {
    alertRepo = new InMemoryAvailabilityAlertRepository();
    useCase = new ListAvailabilityAlertsUseCase(alertRepo);
  });

  it("lists the caller's own alerts, newest first, history included", async () => {
    const older = new AvailabilityAlertBuilder()
      .withCustomerId(CUSTOMER)
      .withStatus('EXPIRED')
      .withCreatedAt(new Date('2026-01-01T00:00:00.000Z'))
      .build();
    const newer = new AvailabilityAlertBuilder()
      .withCustomerId(CUSTOMER)
      .withCreatedAt(new Date('2026-02-01T00:00:00.000Z'))
      .build();
    alertRepo.seed(older);
    alertRepo.seed(newer);

    const result = await useCase.execute({ tenantId: TENANT, customerId: CUSTOMER });

    expect(result.items.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(result.items[1]).toMatchObject({ status: 'EXPIRED', criteriaType: 'ONE_TIME_RANGE' });
  });

  it("never lists another customer's alerts or another tenant's", async () => {
    alertRepo.seed(new AvailabilityAlertBuilder().withCustomerId(OTHER_CUSTOMER).build());
    alertRepo.seed(
      new AvailabilityAlertBuilder().withCustomerId(CUSTOMER).withTenantId(OTHER_TENANT).build(),
    );

    const result = await useCase.execute({ tenantId: TENANT, customerId: CUSTOMER });

    expect(result.items).toEqual([]);
  });

  it('maps a weekly alert to the wire shape (null range fields, HH:mm times)', async () => {
    alertRepo.seed(
      new AvailabilityAlertBuilder()
        .withCustomerId(CUSTOMER)
        .withWeeklyPreference(['monday'], '09:00', '10:30')
        .build(),
    );

    const [item] = (await useCase.execute({ tenantId: TENANT, customerId: CUSTOMER })).items;

    expect(item).toMatchObject({
      criteriaType: 'WEEKLY_PREFERENCE',
      weekdays: ['monday'],
      localStartTime: '09:00',
      localEndTime: '10:30',
      acceptableStartAt: null,
      acceptableEndAt: null,
    });
  });
});
