import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  ILocalizationPort,
  LocalizedNotificationTemplate,
} from '../../application/ports/localization.port';

const SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;
const DEFAULT_LOCALE = 'pt-BR';

type NotificationsFile = Record<string, Record<string, LocalizedNotificationTemplate>>;
type EmailTablesFile = Record<string, Record<string, string>>;

function localesRoot(): string {
  return join(dirname(require.resolve('@ikaro/i18n/package.json')), 'locales');
}

function readLocaleFile<T>(locale: string, fileName: string): T {
  const path = join(localesRoot(), locale, fileName);
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch (err: unknown) {
    throw new Error(`Failed to load locale file "${path}": ${String(err)}`);
  }
}

@Injectable()
export class JsonLocalizationAdapter implements ILocalizationPort {
  private readonly notifications = new Map<string, NotificationsFile>();
  private readonly emailTables = new Map<string, EmailTablesFile>();

  constructor() {
    for (const locale of SUPPORTED_LOCALES) {
      this.notifications.set(
        locale,
        readLocaleFile<NotificationsFile>(locale, 'notifications.json'),
      );
      this.emailTables.set(locale, readLocaleFile<EmailTablesFile>(locale, 'email-tables.json'));
    }
  }

  getNotificationTemplate(
    eventName: string,
    recipientType: string,
    locale: string,
  ): LocalizedNotificationTemplate {
    const resolvedLocale = this.notifications.has(locale) ? locale : DEFAULT_LOCALE;
    const template = this.notifications.get(resolvedLocale)![eventName]?.[recipientType];
    if (!template) {
      throw new Error(
        `No notification template for event "${eventName}" / recipient "${recipientType}" / locale "${resolvedLocale}"`,
      );
    }
    return template;
  }

  getEmailTableHeaders(tableKey: string, locale: string): Record<string, string> {
    const resolvedLocale = this.emailTables.has(locale) ? locale : DEFAULT_LOCALE;
    const headers = this.emailTables.get(resolvedLocale)![tableKey];
    if (!headers) {
      throw new Error(`No email table headers for key "${tableKey}" / locale "${resolvedLocale}"`);
    }
    return headers;
  }
}
