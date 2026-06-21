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
