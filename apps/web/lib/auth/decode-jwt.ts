export interface JwtPayload {
  readonly sub: string;
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly tenantName: string;
  readonly userName: string | null;
  readonly role: 'CUSTOMER' | 'STAFF' | 'MANAGER';
  readonly locale: string;
  readonly exp?: number;
}

// Reads claims for display purposes only — does NOT verify the signature. Safe because the
// real authorization check already happens server-side (BFF) on every API call this cookie
// is forwarded to; this is only ever used server-side (Server Components, Route Handlers) to
// decide what to render, never to authorize an action.
export function decodeJwtPayload(token: string): Partial<JwtPayload> {
  try {
    const [, payload] = token.split('.');
    if (!payload) return {};
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as Partial<JwtPayload>;
  } catch {
    return {};
  }
}
