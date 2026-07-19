import type { CookieOptions } from 'express';

export const JWT_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

export const OAUTH_NONCE_COOKIE_NAME = 'oauth_nonce';

// Binds the signed `state` JWT to the browser that started the OAuth flow (double-submit
// cookie pattern) — a signature+TTL check alone proves the state wasn't tampered with, but
// not that this callback request came from the same browser /auth/google redirected. Without
// this, a captured callback URL (code + valid state) from an attacker-initiated flow can be
// replayed against a victim's browser (login CSRF / authorization-code injection — RFC 6749
// §10.12). maxAge matches OAuthStateService's state JWT TTL.
export const OAUTH_NONCE_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] === 'production',
  sameSite: 'lax',
  maxAge: 5 * 60 * 1000,
  path: '/',
};
