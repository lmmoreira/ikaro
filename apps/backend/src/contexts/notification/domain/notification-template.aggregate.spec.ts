import { NotificationTemplate } from './notification-template.aggregate';
import { NotificationTemplateKey } from './notification-template-key.enum';

const BASE_PROPS = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  triggerEvent: NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
  channel: 'EMAIL' as const,
  locale: 'pt-BR',
  subject: 'Olá, {{customerName}}!',
  body: '<p>Seu agendamento em {{localDate}} às {{localTime}} foi confirmado.</p>',
};

describe('NotificationTemplate', () => {
  describe('create()', () => {
    it('creates template with provided props', () => {
      const t = NotificationTemplate.create(BASE_PROPS);
      expect(t.triggerEvent).toBe(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER);
      expect(t.channel).toBe('EMAIL');
      expect(t.tenantId).toBe(BASE_PROPS.tenantId);
      expect(t.locale).toBe('pt-BR');
    });

    it('accepts null tenantId for global defaults', () => {
      const t = NotificationTemplate.create({ ...BASE_PROPS, tenantId: null });
      expect(t.tenantId).toBeNull();
    });

    it('throws when subject is empty', () => {
      expect(() => NotificationTemplate.create({ ...BASE_PROPS, subject: '' })).toThrow(
        'subject must be non-empty',
      );
    });

    it('throws when subject is whitespace only', () => {
      expect(() => NotificationTemplate.create({ ...BASE_PROPS, subject: '   ' })).toThrow(
        'subject must be non-empty',
      );
    });

    it('throws when body is empty', () => {
      expect(() => NotificationTemplate.create({ ...BASE_PROPS, body: '' })).toThrow(
        'body must be non-empty',
      );
    });
  });

  describe('render()', () => {
    let template: NotificationTemplate;

    beforeEach(() => {
      template = NotificationTemplate.create(BASE_PROPS);
    });

    it('replaces known variables in subject and body', () => {
      const result = template.render({
        customerName: 'João',
        localDate: '15/06/2026',
        localTime: '10:00',
      });
      expect(result.subject).toBe('Olá, João!');
      expect(result.body).toContain('15/06/2026');
      expect(result.body).toContain('10:00');
    });

    it('leaves placeholder as empty string when variable is missing', () => {
      const result = template.render({});
      expect(result.subject).toBe('Olá, !');
      expect(result.body).toContain('às ');
    });

    it('handles empty variables map without error', () => {
      expect(() => template.render({})).not.toThrow();
    });

    it('replaces multiple occurrences of the same variable', () => {
      const t = NotificationTemplate.create({
        ...BASE_PROPS,
        subject: '{{x}} and {{x}}',
        body: '{{x}}',
      });
      const result = t.render({ x: 'hello' });
      expect(result.subject).toBe('hello and hello');
    });

    it('does not alter text without placeholders', () => {
      const t = NotificationTemplate.create({
        ...BASE_PROPS,
        subject: 'Sem variáveis',
        body: '<p>Texto fixo</p>',
      });
      const result = t.render({ customerName: 'João' });
      expect(result.subject).toBe('Sem variáveis');
      expect(result.body).toBe('<p>Texto fixo</p>');
    });
  });

  describe('reconstitute()', () => {
    it('restores aggregate from persisted props without validation', () => {
      const props = {
        id: '00000000-0000-4000-8000-000000000001',
        tenantId: BASE_PROPS.tenantId,
        triggerEvent: BASE_PROPS.triggerEvent,
        channel: BASE_PROPS.channel,
        locale: BASE_PROPS.locale,
        subject: BASE_PROPS.subject,
        body: BASE_PROPS.body,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      };
      const t = NotificationTemplate.reconstitute(props);
      expect(t.id).toBe(props.id);
      expect(t.subject).toBe(props.subject);
      expect(t.updatedAt).toEqual(props.updatedAt);
    });
  });

  describe('update()', () => {
    it('updates subject and body', () => {
      const t = NotificationTemplate.create(BASE_PROPS);
      t.update('Novo assunto', '<p>Novo corpo</p>');
      expect(t.subject).toBe('Novo assunto');
      expect(t.body).toBe('<p>Novo corpo</p>');
    });

    it('throws when new subject is empty', () => {
      const t = NotificationTemplate.create(BASE_PROPS);
      expect(() => t.update('', '<p>ok</p>')).toThrow('subject must be non-empty');
    });

    it('throws when new body is empty', () => {
      const t = NotificationTemplate.create(BASE_PROPS);
      expect(() => t.update('ok', '')).toThrow('body must be non-empty');
    });
  });
});
