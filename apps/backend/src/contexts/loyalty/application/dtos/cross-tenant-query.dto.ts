import { z } from 'zod';

export const CrossTenantQuerySchema = z.object({ tenantId: z.uuid().optional() });
export type CrossTenantQueryDto = z.infer<typeof CrossTenantQuerySchema>;
