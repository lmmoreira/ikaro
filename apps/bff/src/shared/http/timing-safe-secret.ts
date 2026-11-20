import * as crypto from 'node:crypto';

/**
 * Compares two secrets in constant time. Both sides are hashed first so their lengths match
 * (`timingSafeEqual` throws on unequal lengths, and a length check would leak the secret's length).
 * An empty or missing secret on either side never matches, so an unset configuration fails closed.
 */
export function secretsMatch(expected: string | undefined, received: string | undefined): boolean {
  if (!expected || !received) return false;
  const digest = (value: string): Buffer => crypto.createHash('sha256').update(value).digest();
  return crypto.timingSafeEqual(digest(expected), digest(received));
}
