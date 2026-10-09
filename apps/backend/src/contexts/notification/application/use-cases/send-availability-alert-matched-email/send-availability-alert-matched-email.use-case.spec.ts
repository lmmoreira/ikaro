import {
  RECURRING_CUSTOMER_EMAIL,
  RECURRING_CUSTOMER_ID,
  RECURRING_EVENT_ID,
  RECURRING_OTHER_TENANT_ID,
  RECURRING_SERVICE_ID,
  RECURRING_TENANT_ID,
  RecurringScheduleNotificationFixture,
} from '../../../../../test/utils/recurring-schedule-notification-fixture';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendAvailabilityAlertMatchedEmailUseCase } from './send-availability-alert-matched-email.use-case';

// 13:00 UTC is 10:00 in America/Sao_Paulo.
const baseInput = {
  tenantId: RECURRING_TENANT_ID,
  eventId: RECURRING_EVENT_ID,
  correlationId: 'corr-alert-1',
  customerId: RECURRING_CUSTOMER_ID,
  serviceId: RECURRING_SERVICE_ID,
  matchingWindowStart: '2030-03-04T13:00:00.000Z',
};

function build(locale = 'pt-BR') {
  const fx = new RecurringScheduleNotificationFixture(locale);
  fx.seedTemplate(NotificationTemplateKey.AVAILABILITY_ALERT_MATCHED_CUSTOMER);
  const useCase = new SendAvailabilityAlertMatchedEmailUseCase(
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
  return { fx, useCase };
}

describe('SendAvailabilityAlertMatchedEmailUseCase', () => {
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

  it('uses the tenant language (en) and its date and time format', async () => {
    const { fx, useCase } = build('en');

    await useCase.execute(baseInput);

    const message = fx.dispatcher.dispatched[0];
    expect(message.subject).toBe('A slot opened up for Aula de Yoga');
    expect(message.body).toContain('Hello, Maria Souza!');
    expect(message.body).toContain('03/04/2030 10:00 AM');
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
    for (const internal of [RECURRING_CUSTOMER_ID, RECURRING_SERVICE_ID]) {
      expect(body).not.toContain(internal);
    }
  });

  it('sends nothing on a second delivery of the same event', async () => {
    const { fx, useCase } = build();
    await useCase.execute(baseInput);

    const second = await useCase.execute(baseInput);

    expect(second.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
  });

  it('still succeeds when the audit-log row of a sent email cannot be written', async () => {
    const { fx, useCase } = build();
    fx.logRepo.failNextSave(new Error('log database unavailable'));

    const result = await useCase.execute(baseInput);

    expect(result.emailSent).toBe(true);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
    const redelivery = await useCase.execute(baseInput);
    expect(redelivery.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(1);
  });

  it('skips quietly when the customer no longer exists', async () => {
    const { fx, useCase } = build();

    const result = await useCase.execute({ ...baseInput, customerId: 'missing-customer' });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
    expect(fx.logRepo.all).toHaveLength(0);
  });

  it('skips quietly when the service no longer exists', async () => {
    const { fx, useCase } = build();

    const result = await useCase.execute({ ...baseInput, serviceId: 'missing-service' });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
  });

  it('skips quietly when the tenant has no template row', async () => {
    const { fx, useCase } = build();

    const result = await useCase.execute({ ...baseInput, tenantId: RECURRING_OTHER_TENANT_ID });

    expect(result.emailSent).toBe(false);
    expect(fx.dispatcher.dispatched).toHaveLength(0);
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
