import { z } from 'zod';

export const DeleteHotsiteImageSchema = z.object({
  filePath: z.string().regex(/^tenants\/[^/]+\/hotsite\/.+$/),
});

export type DeleteHotsiteImageDto = z.infer<typeof DeleteHotsiteImageSchema>;
