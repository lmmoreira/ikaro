import { z } from 'zod';

// The dev/test signup-session issuer's body (UC-127, M26-S24): the same three fields the Google
// step keeps, so Playwright can start a signup without Google. Never reachable in production.
export const DevSignupSessionSchema = z.object({
  email: z.email(),
  name: z.string().min(1).max(200),
  googleSub: z.string().min(1).max(100),
});

export type DevSignupSessionDto = z.infer<typeof DevSignupSessionSchema>;
