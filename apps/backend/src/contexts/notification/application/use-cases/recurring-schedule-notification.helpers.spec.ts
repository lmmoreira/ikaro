import { NotificationCustomerInfo } from '../ports/notification-customer.port';
import { InMemoryNotificationBookingPort } from '../../../../test/infrastructure/in-memory-notification-booking.port';
import { InMemoryNotificationCustomerPort } from '../../../../test/infrastructure/in-memory-notification-customer.port';
import { InMemoryNotificationPlatformPort } from '../../../../test/infrastructure/in-memory-notification-platform.port';
import {
  buildScheduleSummaryVariables,
  customerVariables,
  resolveRecurringScheduleContext,
} from './recurring-schedule-notification.helpers';

const TENANT = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const CUSTOMER = 'cccccccc-0000-4000-8000-0000000000c1';
const SERVICE = 'eeeeeeee-0000-4000-8000-0000000000e1';

const summary = {
  daysOfWeek: ['tuesday'],
  startTime: '14:00',
  startsOn: '2026-09-01',
  endsOn: '2026-11-24',
};

describe('recurring-schedule-notification.helpers', () => {
  describe('buildScheduleSummaryVariables', () => {
    it('writes the weekdays, time and dates in the tenant language and formats', () => {
      expect(
        buildScheduleSummaryVariables(summary, {
          locale: 'pt-BR',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: '24h',
        }),
      ).toEqual({
        weekdays: 'terça-feira',
        localTime: '14:00',
        startsOn: '01/09/2026',
        endsOn: '24/11/2026',
      });
      expect(
        buildScheduleSummaryVariables(summary, {
          locale: 'en',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h',
        }),
      ).toEqual({
        weekdays: 'Tuesday',
        localTime: '2:00 PM',
        startsOn: '09/01/2026',
        endsOn: '11/24/2026',
      });
    });
  });

  describe('customerVariables', () => {
    it('escapes the customer and service names typed by people', () => {
      expect(
        customerVariables({
          locale: 'pt-BR',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: '24h',
          timezone: 'UTC',
          tenantName: 'Lava <Car>',
          tenantSlug: 'lava-car',
          serviceName: 'Aula <b>Yoga</b>',
          customerName: 'Maria <img src=x>',
          customerEmail: 'maria@example.com',
        }),
      ).toEqual({
        contactName: 'Maria &lt;img src=x&gt;',
        serviceName: 'Aula &lt;b&gt;Yoga&lt;/b&gt;',
      });
    });
  });

  describe('resolveRecurringScheduleContext', () => {
    const customer: NotificationCustomerInfo = { email: 'maria@example.com', name: 'Maria' };
    let customerPort: InMemoryNotificationCustomerPort;
    let servicePort: InMemoryNotificationBookingPort;
    let tenantPort: InMemoryNotificationPlatformPort;
    const input = {
      tenantId: TENANT,
      eventId: 'evt',
      correlationId: 'corr',
      customerId: CUSTOMER,
      serviceId: SERVICE,
    };

    beforeEach(() => {
      customerPort = new InMemoryNotificationCustomerPort();
      servicePort = new InMemoryNotificationBookingPort();
      tenantPort = new InMemoryNotificationPlatformPort();
      customerPort.setCustomer(TENANT, CUSTOMER, customer);
      servicePort.setService(TENANT, { serviceId: SERVICE, serviceName: 'Yoga' });
    });

    it('carries the tenant language, timezone and date and time formats', async () => {
      tenantPort.setTenantInfo(TENANT, {
        id: TENANT,
        name: 'Lava Car',
        slug: 'lavacar',
        timezone: 'America/New_York',
        locale: 'en',
        replyToEmail: null,
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '12h',
      });

      const context = await resolveRecurringScheduleContext(
        { customerPort, servicePort, tenantPort },
        input,
      );

      expect(context).toMatchObject({
        locale: 'en',
        timezone: 'America/New_York',
        dateFormat: 'YYYY-MM-DD',
        timeFormat: '12h',
        serviceName: 'Yoga',
        customerEmail: 'maria@example.com',
      });
    });

    it('falls back to the default language, UTC and the Brazilian formats when the tenant is gone', async () => {
      const context = await resolveRecurringScheduleContext(
        { customerPort, servicePort, tenantPort },
        input,
      );

      expect(context).toMatchObject({
        locale: 'pt-BR',
        timezone: 'UTC',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
        tenantName: '',
      });
    });

    it('returns null when the customer or the service no longer exists', async () => {
      expect(
        await resolveRecurringScheduleContext(
          { customerPort, servicePort, tenantPort },
          { ...input, customerId: 'missing' },
        ),
      ).toBeNull();
      expect(
        await resolveRecurringScheduleContext(
          { customerPort, servicePort, tenantPort },
          { ...input, serviceId: 'missing' },
        ),
      ).toBeNull();
    });
  });
});
