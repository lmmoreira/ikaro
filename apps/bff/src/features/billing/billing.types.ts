import type { z } from 'zod';
import type { BackendTenantAccessSchema } from './billing.schemas';

/** What the BFF keeps of the backend's access answer (never the reason or the internal markers). */
export type BackendTenantAccess = z.infer<typeof BackendTenantAccessSchema>;
