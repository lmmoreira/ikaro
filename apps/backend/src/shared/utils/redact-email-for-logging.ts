// Dispatcher/SMTP error text is arbitrary and unbounded (e.g. "dispatch failed for
// joao@lavacar.com.br", "550 mailbox not found: joao@lavacar.com.br") — the recipient's email
// address is exactly the kind of PII this string can carry into a broadly searchable log stream.
// Redacting only the address (not the whole message) keeps the failure reason legible for
// debugging while removing the PII.
//
// Every quantifier below is bounded (RFC 5321's 64-char local-part limit; a 63-char bound per
// DNS label/remaining-domain segment), not unbounded `+`. SonarCloud flagged an earlier version
// (`[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+`, then a flatter but still-unbounded
// `[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+\.[\w.-]+`) for super-linear backtracking (S5852) — removing
// the nested group alone wasn't sufficient (confirmed empirically: still ~16s on a 50k-char
// pathological input in this file's own regression test). The root cause is more basic than
// group nesting: `.replace(/pattern/g, ...)` retries the whole pattern at every string offset,
// and an *unbounded* greedy class immediately followed by a literal that never appears (no `@`
// anywhere in the input) backtracks the full remaining length at each offset — O(n) work per
// offset, O(n) offsets, O(n²) total, even with zero nested groups. Bounding each quantifier to a
// small constant caps the per-offset backtrack cost, making the whole scan O(n) regardless of
// input content.
const EMAIL_PATTERN = /[\w.!#$%&'*+/=?^`{|}~-]{1,64}@[\w-]{1,63}\.[\w.-]{1,63}/g;

export function redactEmailForLogging(message: string): string {
  return message.replace(EMAIL_PATTERN, '<redacted-email>');
}
