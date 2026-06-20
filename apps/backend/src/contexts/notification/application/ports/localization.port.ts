export const LOCALIZATION_PORT = Symbol('ILocalizationPort');

export interface LocalizedNotificationTemplate {
  subject: string;
  body: string;
}

export interface ILocalizationPort {
  getNotificationTemplate(
    eventName: string,
    recipientType: string,
    locale: string,
  ): LocalizedNotificationTemplate;
  getEmailTableHeaders(tableKey: string, locale: string): Record<string, string>;
}
