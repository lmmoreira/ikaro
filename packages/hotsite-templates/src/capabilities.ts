import type { HotsiteModuleResponse, HotsiteTemplateCapability } from '@ikaro/types';
import { TemplateDefinition } from './types';

type Rule = (module: HotsiteModuleResponse) => HotsiteTemplateCapability | null;

const CONTENT_BLOCK_VARIANTS: Readonly<Record<string, HotsiteTemplateCapability>> = {
  'trust-grid': 'trust-grid',
  'process-steps': 'process-steps',
  'collage-callout': 'collage',
  'image-statement': 'image-statement',
  'immersive-statement': 'immersive-statement',
  'technical-callout': 'technical-callout',
};

const RULES: Readonly<Record<string, Rule>> = {
  NAVIGATION: () => 'navigation',
  HERO: (module) => {
    if (module.data.variant === 'immersive') return 'immersive-hero';
    if (module.data.variant === 'left-aligned' && module.data.rightPanel === 'image') {
      return 'split-hero';
    }
    return null;
  },
  SERVICE_LIST: (module) => {
    if (module.data.layout === 'feature-cards') return 'feature-card-services';
    return module.data.layout === 'numbered' ? 'numbered-services' : null;
  },
  CONTENT_BLOCK: (module) => CONTENT_BLOCK_VARIANTS[String(module.data.variant)] ?? null,
  TESTIMONIALS: (module) => (module.data.layout === 'editorial-quote' ? 'editorial-quote' : null),
  CONTACT: (module) => (module.data.displayStyle === 'icon-cards' ? 'icon-card-contact' : null),
  LEAD_FORM: () => 'lead-form',
  CHATBOT: () => 'chatbot',
};

/**
 * What a template demonstrates, derived from the enabled modules and their variants — never
 * hand-written, so it cannot drift from the definition. Tokens are the closed
 * HOTSITE_TEMPLATE_CAPABILITIES set; the order follows the layout.
 */
export function deriveCapabilities(definition: TemplateDefinition): HotsiteTemplateCapability[] {
  const tokens: HotsiteTemplateCapability[] = [];
  for (const module of definition.layout) {
    if (!module.enabled) continue;
    const token = RULES[module.type]?.(module) ?? null;
    if (token !== null && !tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}
