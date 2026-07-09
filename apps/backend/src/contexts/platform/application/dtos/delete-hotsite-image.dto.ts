import { z } from 'zod';
import { HOTSITE_TMP_PATH_FRAGMENT } from '../../../../shared/utils/tmp-path-regex';

// Accepts either an already-permanent hotsite image (tenants/<id>/hotsite/...) or a not-yet
// promoted tmp/ staging upload (tmp/<id>/...) — see td/TD22-ORPHANED-UPLOAD-CLEANUP.md.
export const DeleteHotsiteImageSchema = z.object({
  filePath: z
    .string()
    .regex(new RegExp(`^(tenants/[^/]+/hotsite/.+|${HOTSITE_TMP_PATH_FRAGMENT})$`)),
});

export type DeleteHotsiteImageDto = z.infer<typeof DeleteHotsiteImageSchema>;
