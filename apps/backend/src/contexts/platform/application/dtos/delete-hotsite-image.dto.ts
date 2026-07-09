import { z } from 'zod';

// Accepts either an already-permanent hotsite image (tenants/<id>/hotsite/...) or a not-yet
// promoted tmp/ staging upload (tmp/<id>/...) — see td/TD22-ORPHANED-UPLOAD-CLEANUP.md.
export const DeleteHotsiteImageSchema = z.object({
  filePath: z.string().regex(/^(tenants\/[^/]+\/hotsite\/.+|tmp\/[^/]+\/.+)$/),
});

export type DeleteHotsiteImageDto = z.infer<typeof DeleteHotsiteImageSchema>;
