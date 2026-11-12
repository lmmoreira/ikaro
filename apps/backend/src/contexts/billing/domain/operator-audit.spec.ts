import { OperatorAuditInvariantError } from './errors/billing-domain.error';
import {
  OPERATOR_AUDIT_ACTOR_MAX_LENGTH,
  OPERATOR_AUDIT_PAYLOAD_MAX_BYTES,
  OperatorAudit,
  type RecordOperatorAuditInput,
} from './operator-audit';

const NOW = new Date('2026-11-12T10:00:00.000Z');

const input = (overrides: Partial<RecordOperatorAuditInput> = {}): RecordOperatorAuditInput => ({
  tenantId: '0197a2f0-0000-7000-8000-000000000001',
  actor: 'ops@ikaro',
  action: 'SUSPEND',
  reason: 'abuse report',
  now: NOW,
  ...overrides,
});

describe('OperatorAudit', () => {
  describe('record', () => {
    it('records the actor, action, tenant, time and reason with a fresh id', () => {
      const audit = OperatorAudit.record(input());

      expect(audit).toMatchObject({
        tenantId: '0197a2f0-0000-7000-8000-000000000001',
        actor: 'ops@ikaro',
        action: 'SUSPEND',
        reason: 'abuse report',
        details: {},
        occurredAt: NOW,
      });
      expect(audit.id).toEqual(expect.any(String));
      expect(OperatorAudit.record(input()).id).not.toBe(audit.id);
    });

    it('trims the actor and the reason', () => {
      const audit = OperatorAudit.record(input({ actor: '  ops@ikaro ', reason: '  why  ' }));

      expect(audit.actor).toBe('ops@ikaro');
      expect(audit.reason).toBe('why');
    });

    it.each(['', '   '])('rejects an empty actor (%j)', (actor) => {
      expect(() => OperatorAudit.record(input({ actor }))).toThrow(OperatorAuditInvariantError);
    });

    it.each(['', '   '])('rejects an empty reason (%j)', (reason) => {
      expect(() => OperatorAudit.record(input({ reason }))).toThrow(OperatorAuditInvariantError);
    });

    it('rejects an actor longer than the column', () => {
      const actor = 'a'.repeat(OPERATOR_AUDIT_ACTOR_MAX_LENGTH + 1);

      expect(() => OperatorAudit.record(input({ actor }))).toThrow(OperatorAuditInvariantError);
      expect(
        OperatorAudit.record(input({ actor: 'a'.repeat(OPERATOR_AUDIT_ACTOR_MAX_LENGTH) })).actor,
      ).toHaveLength(OPERATOR_AUDIT_ACTOR_MAX_LENGTH);
    });

    it('rejects details that carry their own reason key', () => {
      expect(() => OperatorAudit.record(input({ details: { reason: 'sneaky' } }))).toThrow(
        OperatorAuditInvariantError,
      );
    });

    // A negative guarantee: nothing else would notice the cap quietly disappearing.
    it('rejects a payload over 4 KB serialized and accepts one at the limit', () => {
      const overhead = Buffer.byteLength(JSON.stringify({ note: '', reason: 'r' }), 'utf8');
      const atLimit = 'x'.repeat(OPERATOR_AUDIT_PAYLOAD_MAX_BYTES - overhead);

      expect(
        OperatorAudit.record(input({ reason: 'r', details: { note: atLimit } })).details['note'],
      ).toBe(atLimit);
      expect(() =>
        OperatorAudit.record(input({ reason: 'r', details: { note: `${atLimit}x` } })),
      ).toThrow(OperatorAuditInvariantError);
    });

    it('counts bytes, not characters, against the cap', () => {
      const multibyte = '€'.repeat(Math.ceil(OPERATOR_AUDIT_PAYLOAD_MAX_BYTES / 3));

      expect(() => OperatorAudit.record(input({ details: { note: multibyte } }))).toThrow(
        OperatorAuditInvariantError,
      );
    });
  });

  describe('payload', () => {
    it('stores the reason inside the payload next to the details', () => {
      const audit = OperatorAudit.record(
        input({ action: 'GRACE', details: { graceUntil: '2026-12-01T00:00:00.000Z' } }),
      );

      expect(audit.payload()).toEqual({
        graceUntil: '2026-12-01T00:00:00.000Z',
        reason: 'abuse report',
      });
    });
  });
});
