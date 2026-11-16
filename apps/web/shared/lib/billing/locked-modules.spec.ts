import { describe, expect, it } from 'vitest';
import { lockedHotsiteModules } from './locked-modules';

describe('lockedHotsiteModules', () => {
  it('locks the lead form and the Chatbot modules with their own features', () => {
    expect(lockedHotsiteModules(['LEAD_FORM', 'CHATBOT'])).toEqual({
      LEAD_FORM: 'LEAD_FORM',
      CHATBOT: 'CHATBOT',
    });
  });

  it('locks only the module whose feature is locked', () => {
    expect(lockedHotsiteModules(['LEAD_FORM'])).toEqual({ LEAD_FORM: 'LEAD_FORM' });
  });

  it('locks no module when none of their features is locked, whatever else is', () => {
    expect(lockedHotsiteModules([])).toEqual({});
    expect(lockedHotsiteModules(['LOYALTY', 'BOOKING'])).toEqual({});
  });
});
