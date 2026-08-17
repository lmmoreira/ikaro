// Split out of ChatbotWidget.tsx to keep it under the file-length cap — sessionStorage
// read/write helpers for the widget's client-side transcript cache, no JSX/component logic.

export interface ChatTurn {
  // Stable React key (SonarCloud S6479 — array index is not a valid key once messages can be
  // rolled back on a 400, which removes an item from the middle of the array, not just appends).
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

// Scoped per tenant slug: a visitor can browse two tenants' hotsites in the same browser tab
// sequence (no full reload required between them), so a bare, unscoped key would leak one
// tenant's session/transcript into another's widget.
export function sessionIdKey(slug: string): string {
  return `ikaro-chatbot-session-id:${slug}`;
}

export function messagesKey(slug: string): string {
  return `ikaro-chatbot-messages:${slug}`;
}

type StoredChatTurn = Partial<ChatTurn> & Pick<ChatTurn, 'role' | 'content'>;

// A syntactically valid but malformed stored turn (e.g. content: {}) previously reached JSX
// unchecked and crashed the widget — the try/catch below only ever covered JSON.parse failures,
// not a well-formed-but-wrong-shape value (PR #385 review, Codex).
function isStoredChatTurn(value: unknown): value is StoredChatTurn {
  if (typeof value !== 'object' || value === null) return false;
  const turn = value as Record<string, unknown>;
  return (
    (turn.role === 'user' || turn.role === 'assistant') &&
    typeof turn.content === 'string' &&
    (turn.id === undefined || typeof turn.id === 'string')
  );
}

// Backfills `id` for a transcript stored before this field existed — sessionStorage can
// legitimately hold that older shape across a hot-reload/deploy within the same tab session.
export function readStoredMessages(slug: string): ChatTurn[] {
  try {
    const raw = sessionStorage.getItem(messagesKey(slug));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isStoredChatTurn)
      .map((turn) => ({ id: turn.id ?? crypto.randomUUID(), ...turn }));
  } catch {
    return [];
  }
}
