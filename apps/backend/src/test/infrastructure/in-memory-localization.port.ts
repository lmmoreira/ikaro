import type {
  ILocalizationPort,
  LocalizedNotificationTemplate,
} from '../../contexts/notification/application/ports/localization.port';

export class InMemoryLocalizationPort implements ILocalizationPort {
  private readonly templates = new Map<string, LocalizedNotificationTemplate>();
  private readonly tableHeaders = new Map<string, Map<string, Record<string, string>>>();

  // Key includes locale so tests actually fail if the use case under test passes the wrong
  // locale through to ILocalizationPort, instead of silently matching regardless of locale.
  setTemplate(eventNameAndRecipientType: string, template: LocalizedNotificationTemplate): this {
    return this.setTemplateForLocale(eventNameAndRecipientType, 'pt-BR', template);
  }

  setTemplateForLocale(
    eventNameAndRecipientType: string,
    locale: string,
    template: LocalizedNotificationTemplate,
  ): this {
    this.templates.set(`${eventNameAndRecipientType}:${locale}`, template);
    return this;
  }

  setTableHeaders(tableKey: string, locale: string, headers: Record<string, string>): this {
    const byLocale = this.tableHeaders.get(tableKey) ?? new Map<string, Record<string, string>>();
    byLocale.set(locale, headers);
    this.tableHeaders.set(tableKey, byLocale);
    return this;
  }

  getNotificationTemplate(
    eventName: string,
    recipientType: string,
    locale: string,
  ): LocalizedNotificationTemplate {
    const template = this.templates.get(`${eventName}:${recipientType}:${locale}`);
    if (!template) throw new Error(`No template for ${eventName}:${recipientType}:${locale}`);
    return template;
  }

  getEmailTableHeaders(tableKey: string, locale: string): Record<string, string> {
    const byLocale = this.tableHeaders.get(tableKey);
    if (!byLocale) throw new Error(`No table headers for key "${tableKey}"`);
    return byLocale.get(locale) ?? byLocale.get('pt-BR') ?? {};
  }
}
