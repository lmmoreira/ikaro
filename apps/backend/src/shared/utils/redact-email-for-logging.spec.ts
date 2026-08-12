import { redactEmailForLogging } from './redact-email-for-logging';

describe('redactEmailForLogging', () => {
  it('redacts an email address embedded in a dispatch-failure message', () => {
    expect(redactEmailForLogging('dispatch failed for joao@lavacar.com.br')).toBe(
      'dispatch failed for <redacted-email>',
    );
  });

  it('redacts an email address embedded in a raw SMTP diagnostic message', () => {
    expect(redactEmailForLogging('550 mailbox not found: joao@lavacar.com.br')).toBe(
      '550 mailbox not found: <redacted-email>',
    );
  });

  it('redacts multiple email addresses in the same message', () => {
    expect(redactEmailForLogging('a@test.com and b@test.com both failed')).toBe(
      '<redacted-email> and <redacted-email> both failed',
    );
  });

  it('returns the message unchanged when it has no email address', () => {
    expect(redactEmailForLogging('Error: smtp timeout')).toBe('Error: smtp timeout');
  });
});
