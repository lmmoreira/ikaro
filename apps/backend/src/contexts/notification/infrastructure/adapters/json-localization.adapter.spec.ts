import { JsonLocalizationAdapter } from './json-localization.adapter';

describe('JsonLocalizationAdapter', () => {
  let adapter: JsonLocalizationAdapter;

  beforeEach(() => {
    adapter = new JsonLocalizationAdapter();
  });

  describe('getNotificationTemplate', () => {
    it('returns the pt-BR subject and body for a known event/recipient pair', () => {
      const result = adapter.getNotificationTemplate('BookingApproved', 'customer', 'pt-BR');
      expect(result.subject).toBe('Seu agendamento foi confirmado!');
      expect(result.body).toContain('{{contactName}}');
    });

    it('returns the en subject for the same event/recipient pair', () => {
      const result = adapter.getNotificationTemplate('BookingApproved', 'customer', 'en');
      expect(result.subject).toBe('Your booking is confirmed!');
    });

    it('falls back to pt-BR when the locale is unknown', () => {
      const result = adapter.getNotificationTemplate('BookingApproved', 'customer', 'fr');
      expect(result.subject).toBe('Seu agendamento foi confirmado!');
    });

    it('throws including the resolved locale when the event/recipient combination does not exist', () => {
      expect(() => adapter.getNotificationTemplate('UnknownEvent', 'customer', 'pt-BR')).toThrow(
        /locale "pt-BR"/,
      );
    });

    it('throws including the fallback locale (not the requested one) for an unknown locale', () => {
      expect(() => adapter.getNotificationTemplate('UnknownEvent', 'customer', 'fr')).toThrow(
        /locale "pt-BR"/,
      );
    });

    it('resolves every documented event/recipient pair for both locales', () => {
      const pairs: [string, string][] = [
        ['BookingRequested', 'admin'],
        ['BookingRequested', 'customer'],
        ['BookingApproved', 'customer'],
        ['BookingRejected', 'customer'],
        ['BookingInfoRequested', 'customer'],
        ['BookingInfoSubmitted', 'admin'],
        ['BookingCancelled', 'customer'],
        ['BookingCancelled', 'admin'],
        ['BookingRescheduled', 'customer'],
        ['BookingRescheduled', 'admin'],
        ['BookingReminderDue', 'customer'],
        ['BookingReminderDueToday', 'customer'],
        ['AdminDailyScheduleReminder', 'admin'],
        ['ServicePointsEarned', 'customer'],
        ['PointsExpiringSoon', 'customer'],
        ['StaffInvited', 'staff'],
      ];

      for (const [eventName, recipientType] of pairs) {
        for (const locale of ['pt-BR', 'en']) {
          const result = adapter.getNotificationTemplate(eventName, recipientType, locale);
          expect(result.subject.length).toBeGreaterThan(0);
          expect(result.body.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('getEmailTableHeaders', () => {
    it('returns pt-BR column headers for the admin daily schedule table', () => {
      const headers = adapter.getEmailTableHeaders('adminDailySchedule', 'pt-BR');
      expect(headers.time).toBe('Horário');
      expect(headers.customer).toBe('Cliente');
    });

    it('returns en column headers for the same table', () => {
      const headers = adapter.getEmailTableHeaders('adminDailySchedule', 'en');
      expect(headers.time).toBe('Time');
      expect(headers.customer).toBe('Customer');
    });

    it('falls back to pt-BR when the locale is unknown', () => {
      const headers = adapter.getEmailTableHeaders('adminDailySchedule', 'fr');
      expect(headers.time).toBe('Horário');
    });

    it('throws including the resolved locale when the table key does not exist', () => {
      expect(() => adapter.getEmailTableHeaders('unknownTable', 'pt-BR')).toThrow(/locale "pt-BR"/);
    });
  });
});
