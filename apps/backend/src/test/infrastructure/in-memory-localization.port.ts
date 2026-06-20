import type {
  ILocalizationPort,
  LocalizedNotificationTemplate,
} from '../../contexts/notification/application/ports/localization.port';

export class InMemoryLocalizationPort implements ILocalizationPort {
  private readonly templates = new Map<string, LocalizedNotificationTemplate>();
  private readonly tableHeaders = new Map<string, Map<string, Record<string, string>>>();

  setTemplate(key: string, template: LocalizedNotificationTemplate): this {
    this.templates.set(key, template);
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
    _locale: string,
  ): LocalizedNotificationTemplate {
    const template = this.templates.get(`${eventName}:${recipientType}`);
    if (!template) throw new Error(`No template for ${eventName}:${recipientType}`);
    return template;
  }

  getEmailTableHeaders(tableKey: string, locale: string): Record<string, string> {
    const byLocale = this.tableHeaders.get(tableKey);
    if (!byLocale) throw new Error(`No table headers for key "${tableKey}"`);
    return byLocale.get(locale) ?? byLocale.get('pt-BR') ?? {};
  }
}
