import {
  RECURRING_CUSTOMER_EMAIL,
  RECURRING_CUSTOMER_ID,
  RECURRING_EVENT_ID,
  RECURRING_OTHER_TENANT_ID,
  RECURRING_SERVICE_ID,
  RECURRING_TENANT_ID,
  RecurringScheduleNotificationFixture,
} from '../../../../../test/utils/recurring-schedule-notification-fixture';
import { InMemoryAvailabilityAlertOutcomePort } from '../../../../../test/infrastructure/in-memory-availability-alert-outcome.port';
import { IApplicationConfig } from '../../../../../shared/ports/application-config.port';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendAvailabilityAlertMatchedNotificationUseCase } from './send-availability-alert-matched-notification.use-case';

const ALERT_ID = 'ffffffff-0000-4000-8000-0000000000f1';
// 13:00 UTC is 10:00 in America/Sao_Paulo.
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

const config: IApplicationConfig = {
  getOrThrow: (key: string) => {
    if (key !== 'FRONTEND_URL') throw new Error(`Unknown config key: ${key}`);
    return 'https://app.ikaro.test';
  },
};

function build(locale = 'pt-BR') {
  const fx = new RecurringScheduleNotificationFixture(locale);
  const outcomePort = new InMemoryAvailabilityAlertOutcomePort();
  fx.seedTemplate(NotificationTemplateKey.AVAILABILITY_ALERT_MATCHED_CUSTOMER);
  const useCase = new SendAvailabilityAlertMatchedNotificationUseCase(
    fx.logRepo,
    fx.inboxRepo,
    fx.dispatcher,
    fx.customerPort,
    fx.servicePort,
    fx.tenantPort,
    fx.txManager,
    fx.templateRepo,
    fx.localizationPort,
    config,
    outcomePort,
  );
  return { fx, outcomePort, useCase };
}

describe('SendAvailabilityAlertMatchedNotificationUseCase', () => {
  it('emails the customer in pt-BR with the service, the window and the booking link', async () => {
    const { fx, useCase } = build();

    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
    const message = fx.dispatcher.dispatched[0];
    expect(message.to).toBe(RECURRING_CUSTOMER_EMAIL);
    expect(message.subject).toBe('Abriu uma vaga para Aula de Yoga');
    expect(message.body).toContain('Olá, Maria Souza!');
    expect(message.body).toContain('Aula de Yoga');
    expect(message.body).toContain('04/03/2030 10:00');
    expect(message.body).toContain('href="https://app.ikaro.test/lavacar"');
    expect(message.body).not.toContain('{{');
    expect(fx.logRepo.all.map((l) => l.notificationType)).toEqual([
      'availability-alert-matched-customer',
    ]);
  });

  it('uses the tenant language (en)', async () => {
    const { fx, useCase } = build('en');

    await useCase.execute(baseInput);

    expect(fx.dispatcher.dispatched[0].subject).toBe('A slot opened up for Aula de Yoga');
    expect(fx.dispatcher.dispatched[0].body).toContain('Hello, Maria Souza!');
  });

  it('escapes the service name and the customer name', async () => {
    const { fx, useCase } = build();
    fx.servicePort.setService(RECURRING_TENANT_ID, {
      serviceId: RECURRING_SERVICE_ID,
      serviceName: '<script>alert(1)</script>',
    });

    await useCase.execute(baseInput);

    const { body } = fx.dispatcher.dispatched[0];
    expect(body).not.toContain('<script>');
    expect(body).toContain('&lt;script&gt;');
  });

  it('shows no internal identifier', async () => {
    const { fx, useCase } = build();

    await useCase.execute(baseInput);

    const { body } = fx.dispatcher.dispatched[0];
    for (const internal of [RECURRING_CUSTOMER_ID, RECURRING_SERVICE_ID, ALERT_ID]) {
      expect(body).not.toContain(internal);
    }
  });

  it('reports SENT after the email went out', async () => {
    const { outcomePort, useCase } = build();

    await useCase.execute(baseInput);

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

  it('sends nothing and reports nothing on a second delivery of the same event', async () => {
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

  it('does not fail an email that went out when the SENT report cannot be recorded', async () => {
    const { fx, outcomePort, useCase } = build();
    outcomePort.failAlways(new Error('booking database unavailable'));

    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
  });

  it('skips quietly, without a report, when the customer no longer exists', async () => {
    const { fx, outcomePort, useCase } = build();

    const result = await useCase.execute({ ...baseInput, customerId: 'missing-customer' });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
    expect(outcomePort.reports).toHaveLength(0);
  });

  it('skips quietly when the service no longer exists', async () => {
    const { fx, outcomePort, useCase } = build();

    const result = await useCase.execute({ ...baseInput, serviceId: 'missing-service' });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(outcomePort.reports).toHaveLength(0);
  });

  it('skips quietly when the tenant has no template row', async () => {
    const { fx, outcomePort, useCase } = build();

    const result = await useCase.execute({ ...baseInput, tenantId: RECURRING_OTHER_TENANT_ID });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(outcomePort.reports).toHaveLength(0);
  });

  it('never resolves another tenant’s customer, service or template', async () => {
    const { fx, useCase } = build();
    fx.seedTemplate(
      NotificationTemplateKey.AVAILABILITY_ALERT_MATCHED_CUSTOMER,
      RECURRING_OTHER_TENANT_ID,
    );

    const result = await useCase.execute({ ...baseInput, tenantId: RECURRING_OTHER_TENANT_ID });

    expect(result.emailSent).toBe(false);
    expect(fx.logRepo.all.every((l) => l.tenantId !== RECURRING_TENANT_ID)).toBe(true);
  });
});
