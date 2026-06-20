import type {
  ILocalizationPort,
  LocalizedNotificationTemplate,
} from '../../contexts/notification/application/ports/localization.port';

export class InMemoryLocalizationPort implements ILocalizationPort {
  private readonly templates = new Map<string, LocalizedNotificationTemplate>();
  private readonly tableHeaders = new Map<string, Record<string, string>>();

  setTemplate(key: string, template: LocalizedNotificationTemplate): this {
    this.templates.set(key, template);
    return this;
  }

  setTableHeaders(tableKey: string, headers: Record<string, string>): this {
    this.tableHeaders.set(tableKey, headers);
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

  getEmailTableHeaders(tableKey: string, _locale: string): Record<string, string> {
    return this.tableHeaders.get(tableKey) ?? {};
  }
}
