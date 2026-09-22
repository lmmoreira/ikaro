import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NotificationTemplateKey } from './notification-template-key.enum';
import { NOTIFICATION_TEMPLATE_KEY_MAPPING } from './notification-template-key.mapping';

describe('NOTIFICATION_TEMPLATE_KEY_MAPPING', () => {
  it('has an entry for every NotificationTemplateKey', () => {
    for (const key of Object.values(NotificationTemplateKey)) {
      expect(NOTIFICATION_TEMPLATE_KEY_MAPPING[key]).toBeDefined();
    }
  });

  it('every entry has a non-empty eventName and recipientType', () => {
    for (const mapping of Object.values(NOTIFICATION_TEMPLATE_KEY_MAPPING)) {
      expect(mapping.eventName.length).toBeGreaterThan(0);
      expect(mapping.recipientType.length).toBeGreaterThan(0);
    }
  });
});

// packages/i18n/locales/**/notifications.json sits outside that package's compiled
// dist and must be read via Node's own module resolution, the same way
// JsonLocalizationAdapter does (docs/ENGINEERING_RULES.md "Static locale/config
// files in workspace packages") — never via a TS `import` of the JSON file.
const SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;
type NotificationsFile = Record<string, Record<string, { subject: string; body: string }>>;

function readNotificationsFile(locale: string): NotificationsFile {
  const localesRoot = join(dirname(require.resolve('@ikaro/i18n/package.json')), 'locales');
  return JSON.parse(
    readFileSync(join(localesRoot, locale, 'notifications.json'), 'utf-8'),
  ) as NotificationsFile;
}

// Generalizes the error-code-catalogue exhaustiveness pattern
// (apps/web/shared/lib/i18n/error-codes-exhaustiveness.spec.ts) to notifications:
// every mapping entry must resolve to real, translated content, and no
// notifications.json entry may be orphaned (present with no mapping key pointing
// at it) in either locale (TD37 Story 12).
describe('NOTIFICATION_TEMPLATE_KEY_MAPPING <-> notifications.json key parity (TD37 Story 12)', () => {
  it.each(SUPPORTED_LOCALES)('every mapping entry has a translated template in %s', (locale) => {
    const notifications = readNotificationsFile(locale);
    for (const { eventName, recipientType } of Object.values(NOTIFICATION_TEMPLATE_KEY_MAPPING)) {
      const template = notifications[eventName]?.[recipientType];
      expect(template).toBeDefined();
      expect(template?.subject.length).toBeGreaterThan(0);
      expect(template?.body.length).toBeGreaterThan(0);
    }
  });

  it.each(SUPPORTED_LOCALES)(
    'has no notifications.json entry in %s without a matching mapping entry',
    (locale) => {
      const notifications = readNotificationsFile(locale);
      const mappedPairs = new Set(
        Object.values(NOTIFICATION_TEMPLATE_KEY_MAPPING).map(
          ({ eventName, recipientType }) => `${eventName}.${recipientType}`,
        ),
      );
      const orphaned: string[] = [];
      for (const [eventName, recipients] of Object.entries(notifications)) {
        for (const recipientType of Object.keys(recipients)) {
          const pair = `${eventName}.${recipientType}`;
          if (!mappedPairs.has(pair)) {
            orphaned.push(pair);
          }
        }
      }
      expect(orphaned).toEqual([]);
    },
  );
});
