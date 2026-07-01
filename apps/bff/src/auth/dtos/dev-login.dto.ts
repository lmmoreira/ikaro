import { z } from 'zod';
import { JwtRole } from '../jwt-issuer.service';

export const DevLoginSchema = z.object({
  email: z.email(),
  tenantSlug: z
    .string()
    .regex(/^[a-z0-9-]+$/, 'slug must contain only lowercase letters, numbers and hyphens'),
  type: z.enum(['staff', 'customer']),
});

export type DevLoginDto = z.infer<typeof DevLoginSchema>;

export interface DevLoginResponse {
  accessToken: string;
  user: {
    sub: string;
    tenantId: string;
    tenantSlug: string;
    role: JwtRole;
  };
}
