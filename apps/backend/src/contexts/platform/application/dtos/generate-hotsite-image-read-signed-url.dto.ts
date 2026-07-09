import { z } from 'zod';
import { TMP_PATH_REGEX } from '../../../../shared/utils/tmp-path-regex';

// Only for not-yet-promoted tmp/ staging uploads — an already-permanent tenants/.../hotsite/...
// image resolves via the pure getPublicUrl() string template instead (see
// td/TD22-ORPHANED-UPLOAD-CLEANUP.md § tmp/ image preview).
export const GenerateHotsiteImageReadSignedUrlSchema = z.object({
  filePath: z.string().regex(TMP_PATH_REGEX),
});

export type GenerateHotsiteImageReadSignedUrlDto = z.infer<
  typeof GenerateHotsiteImageReadSignedUrlSchema
>;
