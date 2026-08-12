// Dispatcher/SMTP error text is arbitrary and unbounded (e.g. "dispatch failed for
// joao@lavacar.com.br", "550 mailbox not found: joao@lavacar.com.br") — the recipient's email
// address is exactly the kind of PII this string can carry into a broadly searchable log stream.
// Redacting only the address (not the whole message) keeps the failure reason legible for
// debugging while removing the PII.
const EMAIL_PATTERN = /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g;

export function redactEmailForLogging(message: string): string {
  return message.replace(EMAIL_PATTERN, '<redacted-email>');
}
