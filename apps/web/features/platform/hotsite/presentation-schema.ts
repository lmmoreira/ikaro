import { HotsiteModulePresentationSchema } from '@ikaro/types';
import type { HotsiteModulePresentation } from '@ikaro/types';

// The shape is defined once in @ikaro/types and shared with @ikaro/validation. Only the shape is
// checked here: which module types accept a `presentation` at all, and which accept
// `presentation.background`, are layout rules the backend owns (HotsiteConfig), shown on Publish.
export { HotsiteModulePresentationSchema };

export function isValidPresentation(value: unknown): value is HotsiteModulePresentation {
  return HotsiteModulePresentationSchema.safeParse(value).success;
}
