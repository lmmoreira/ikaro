import { describe, expect, it } from 'vitest';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import {
  buildIntakeRequestFields,
  emptyIntakeAnswers,
  validateIntake,
  type IntakeAnswersValue,
} from './intake-answers';

function makeSchema(
  overrides: Partial<ServiceIntakeSchemaVersion> = {},
): ServiceIntakeSchemaVersion {
  return {
    id: 'schema-1',
    version: 2,
    questions: [
      { fieldKey: 'goal', label: 'Objetivo', type: 'FREE_TEXT', required: true },
      { fieldKey: 'access', label: 'Acesso', type: 'FREE_TEXT', required: false },
      { fieldKey: 'firstTime', label: 'Primeira vez', type: 'BOOLEAN', required: false },
      { fieldKey: 'equipment', label: 'Equipamento', type: 'BOOLEAN', required: true },
    ],
    consentText: 'Aceito',
    consentVersion: 1,
    requiresNamedAttendees: false,
    participantCountRequired: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function filled(overrides: Partial<IntakeAnswersValue> = {}): IntakeAnswersValue {
  return {
    ...emptyIntakeAnswers(),
    answers: { goal: 'Treino', equipment: false },
    consentAccepted: true,
    ...overrides,
  };
}

describe('validateIntake', () => {
  it('flags every missing required answer and the consent on an empty form', () => {
    const result = validateIntake(makeSchema(), emptyIntakeAnswers());
    expect(result.missingQuestions).toEqual(['goal', 'equipment']);
    expect(result.consent).toBe(true);
    expect(result.count).toBe(3);
  });

  it('treats whitespace-only text as missing', () => {
    const result = validateIntake(
      makeSchema(),
      filled({ answers: { goal: '   ', equipment: true } }),
    );
    expect(result.missingQuestions).toEqual(['goal']);
  });

  it('accepts "Não" (false) as an answer to a required yes/no', () => {
    expect(validateIntake(makeSchema(), filled()).count).toBe(0);
  });

  it('does not require an optional boolean or optional text', () => {
    expect(validateIntake(makeSchema(), filled()).missingQuestions).toEqual([]);
  });

  it.each([
    ['', true],
    ['0', true],
    ['-2', true],
    ['1.5', true],
    ['abc', true],
    ['3', false],
  ])('participantCount %j is invalid=%s when required', (raw, invalid) => {
    const result = validateIntake(
      makeSchema({ participantCountRequired: true }),
      filled({ participantCount: raw }),
    );
    expect(result.participants).toBe(invalid);
  });

  it('ignores the participant count when it is not required', () => {
    expect(validateIntake(makeSchema(), filled({ participantCount: '' })).participants).toBe(false);
  });

  it('flags a blank attendee name only when attendees are asked', () => {
    const value = filled({ attendees: [{ name: '  ', isMinor: false }] });
    expect(validateIntake(makeSchema({ requiresNamedAttendees: true }), value).attendees).toBe(
      true,
    );
    expect(validateIntake(makeSchema(), value).attendees).toBe(false);
  });

  it('requires no minimum attendee count', () => {
    expect(validateIntake(makeSchema({ requiresNamedAttendees: true }), filled()).attendees).toBe(
      false,
    );
  });
});

describe('buildIntakeRequestFields', () => {
  it('submits the displayed version, trimmed text, booleans and the consent', () => {
    const fields = buildIntakeRequestFields(
      makeSchema(),
      filled({ answers: { goal: ' Treino ', access: '   ', firstTime: false, equipment: true } }),
    );
    expect(fields).toEqual({
      intakeSchemaVersion: 2,
      intakeAnswers: { goal: 'Treino', firstTime: false, equipment: true },
      consentAccepted: true,
    });
  });

  it('omits an untouched optional boolean instead of sending false', () => {
    const fields = buildIntakeRequestFields(makeSchema(), filled());
    expect(fields.intakeAnswers).toEqual({ goal: 'Treino', equipment: false });
  });

  it('drops answers of keys that are not in the displayed schema', () => {
    const fields = buildIntakeRequestFields(
      makeSchema(),
      filled({ answers: { goal: 'x', equipment: true, stale: 'old' } }),
    );
    expect(fields.intakeAnswers).not.toHaveProperty('stale');
  });

  it('adds participantCount and trimmed attendees only when the schema asks for them', () => {
    const value = filled({
      participantCount: '3',
      attendees: [
        { name: ' Ana ', isMinor: true },
        { name: '', isMinor: false },
      ],
    });
    expect(buildIntakeRequestFields(makeSchema(), value)).not.toHaveProperty('participantCount');
    const fields = buildIntakeRequestFields(
      makeSchema({ participantCountRequired: true, requiresNamedAttendees: true }),
      value,
    );
    expect(fields.participantCount).toBe(3);
    expect(fields.attendees).toEqual([{ name: 'Ana', isMinor: true }]);
  });
});
