import type {
  HotsiteBrandingResponse,
  HotsiteModuleResponse,
  HotsiteSeoResponse,
  HotsiteTemplateId,
} from '@ikaro/types';
import { applyTemplateCopy } from './apply-copy';
import { getTemplateCopy, getTemplateDefinition } from './catalogue';
import { TemplateIdentity, TemplateLocale } from './types';

export interface BuiltTemplateManifest {
  branding: HotsiteBrandingResponse;
  layout: HotsiteModuleResponse[];
  seo: HotsiteSeoResponse;
}

/**
 * The single place a template definition, its locale copy and an identity become a whole,
 * standalone manifest. The backend materializer and every test that needs a "whole" template
 * (schema validation, palette contrast, E2E fixtures) call this, so the merge logic exists once.
 * Branding is the template's palette/typography plus the given identity and no logo; SEO is empty,
 * because a definition never carries one. Applying a template to a real tenant does not use the
 * branding or SEO from here: those stay the tenant's own (see the backend materializer).
 */
export function buildTemplateManifest(
  id: HotsiteTemplateId,
  locale: TemplateLocale,
  identity: TemplateIdentity,
): BuiltTemplateManifest {
  const definition = getTemplateDefinition(id);
  return {
    branding: {
      ...definition.branding,
      brandName: identity.brandName,
      brandTagline: identity.tagline,
      logoUrl: '',
    },
    layout: applyTemplateCopy(definition.layout, getTemplateCopy(id, locale), identity),
    seo: { title: null, description: null, ogImageUrl: '' },
  };
}
