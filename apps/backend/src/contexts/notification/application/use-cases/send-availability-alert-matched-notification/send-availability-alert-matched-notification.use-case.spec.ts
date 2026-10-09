import {
  RECURRING_CUSTOMER_ID,
  RECURRING_EVENT_ID,
  RECURRING_SERVICE_ID,
  RECURRING_TENANT_ID,
  RecurringScheduleNotificationFixture,
} from '../../../../../test/utils/recurring-schedule-notification-fixture';
import { InMemoryAvailabilityAlertOutcomePort } from '../../../../../test/infrastructure/in-memory-availability-alert-outcome.port';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendAvailabilityAlertMatchedEmailUseCase } from '../send-availability-alert-matched-email/send-availability-alert-matched-email.use-case';
import { SendAvailabilityAlertMatchedNotificationUseCase } from './send-availability-alert-matched-notification.use-case';

const ALERT_ID = 'ffffffff-0000-4000-8000-0000000000f1';
const baseInput = {
  tenantId: RECURRING_TENANT_ID,
  eventId: RECURRING_EVENT_ID,
  correlationId: 'corr-alert-1',
  customerId: RECURRING_CUSTOMER_ID,
  serviceId: RECURRING_SERVICE_ID,
  alertId: ALERT_ID,
  matchingWindowStart: '2030-03-04T13:00:00.000Z',
  matchingWindowEnd: '2030-03-04T14:00:00.000Z',
};

function build() {
  const fx = new RecurringScheduleNotificationFixture();
  const outcomePort = new InMemoryAvailabilityAlertOutcomePort();
  fx.seedTemplate(NotificationTemplateKey.AVAILABILITY_ALERT_MATCHED_CUSTOMER);
  const sendEmail = new SendAvailabilityAlertMatchedEmailUseCase(
    fx.logRepo,
    fx.inboxRepo,
    fx.dispatcher,
    fx.customerPort,
    fx.servicePort,
    fx.tenantPort,
    fx.txManager,
    fx.templateRepo,
    fx.localizationPort,
  );
  const useCase = new SendAvailabilityAlertMatchedNotificationUseCase(sendEmail, outcomePort);
  return { fx, outcomePort, useCase };
}

describe('SendAvailabilityAlertMatchedNotificationUseCase', () => {
  it('reports SENT after the email went out', async () => {
    const { fx, outcomePort, useCase } = build();

    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
    expect(outcomePort.reports).toEqual([
      {
        tenantId: RECURRING_TENANT_ID,
        alertId: ALERT_ID,
        correlationId: 'corr-alert-1',
        matchingWindowStart: baseInput.matchingWindowStart,
        matchingWindowEnd: baseInput.matchingWindowEnd,
        outcome: 'SENT',
        errorMessage: null,
      },
    ]);
  });

  it('reports nothing on a second delivery of the same event', async () => {
    const { fx, outcomePort, useCase } = build();
    await useCase.execute(baseInput);

    const second = await useCase.execute(baseInput);

    expect(second.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
    expect(outcomePort.reports).toHaveLength(1);
  });

  describe('a send that fails', () => {
    it('reports FAILED with the reason, redacted, and rethrows so Pub/Sub redelivers', async () => {
      const { fx, outcomePort, useCase } = build();
      fx.dispatcher.failNext(new Error('550 mailbox not found: maria@example.com'));

      await expect(useCase.execute(baseInput)).rejects.toThrow('550 mailbox not found');

      expect(outcomePort.reports).toHaveLength(1);
      expect(outcomePort.reports[0]).toMatchObject({ outcome: 'FAILED' });
      expect(outcomePort.reports[0].errorMessage).toContain('550 mailbox not found');
      expect(outcomePort.reports[0].errorMessage).not.toContain('maria@example.com');
    });

    it('keeps the stored reason within the column length', async () => {
      const { fx, outcomePort, useCase } = build();
      fx.dispatcher.failNext(new Error('x'.repeat(2_000)));

      await expect(useCase.execute(baseInput)).rejects.toThrow();

      expect(outcomePort.reports[0].errorMessage).toHaveLength(500);
    });

    it('reports SENT when the redelivery succeeds, after the earlier FAILED', async () => {
      const { fx, outcomePort, useCase } = build();
      fx.dispatcher.failNext(new Error('smtp down'));
      await expect(useCase.execute(baseInput)).rejects.toThrow();

      const retry = await useCase.execute(baseInput);

      expect(retry.emailSent).toBe(true);
      expect(outcomePort.reports.map((r) => r.outcome)).toEqual(['FAILED', 'SENT']);
      expect(fx.dispatcher.dispatched).toHaveLength(1);
    });

    it('still throws the original error when the report itself cannot be recorded', async () => {
      const { fx, outcomePort, useCase } = build();
      fx.dispatcher.failNext(new Error('smtp down'));
      outcomePort.failAlways(new Error('booking database unavailable'));

      await expect(useCase.execute(baseInput)).rejects.toThrow('smtp down');
    });
  });

  it('reports SENT, not FAILED, when the email went out but its audit-log row could not be written', async () => {
    const { fx, outcomePort, useCase } = build();
    fx.logRepo.failNextSave(new Error('log database unavailable'));

    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(true);
    expect(outcomePort.reports.map((r) => r.outcome)).toEqual(['SENT']);
  });

  it('does not fail an email that went out when the SENT report cannot be recorded', async () => {
    const { fx, outcomePort, useCase } = build();
    outcomePort.failAlways(new Error('booking database unavailable'));

    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
  });

  it.each([
    ['the customer', { customerId: 'missing-customer' }],
    ['the service', { serviceId: 'missing-service' }],
  ])('reports nothing when %s no longer exists', async (_what, change) => {
    const { fx, outcomePort, useCase } = build();

    const result = await useCase.execute({ ...baseInput, ...change });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(outcomePort.reports).toHaveLength(0);
  });
});
