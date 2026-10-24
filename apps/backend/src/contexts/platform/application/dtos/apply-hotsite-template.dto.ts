import { z } from 'zod';
import { ApplyHotsiteTemplateSchema } from '@ikaro/validation';

// The manager's current (possibly unsaved) draft. Applying a template is a pure function of this
// value, the tenant from the JWT and that tenant's language — never of the saved config. The schema
// is shared with the BFF (@ikaro/validation) so the two apps cannot drift apart.
export { ApplyHotsiteTemplateSchema };

export type ApplyHotsiteTemplateDto = z.infer<typeof ApplyHotsiteTemplateSchema>;
