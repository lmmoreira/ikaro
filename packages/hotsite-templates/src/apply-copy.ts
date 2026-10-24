import type { HotsiteModuleResponse } from '@ikaro/types';
import { TemplateCopy, TemplateCopyError, TemplateIdentity } from './types';

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

function interpolate(key: string, value: string, identity: TemplateIdentity): string {
  const replaced = value.replace(PLACEHOLDER, (_match, name: string) => {
    if (name !== 'brandName' && name !== 'tagline') {
      throw new TemplateCopyError(`Copy key "${key}" uses unknown placeholder "{{${name}}}"`);
    }
    return identity[name];
  });
  if (replaced.includes('{{')) {
    throw new TemplateCopyError(`Copy key "${key}" leaves an unresolved "{{" in its text`);
  }
  return replaced;
}

function setLeaf(layout: HotsiteModuleResponse[], key: string, value: string): void {
  const [moduleType, ...path] = key.split('.');
  const module = layout.find((candidate) => candidate.type === moduleType);
  if (module === undefined || path.length === 0) {
    throw new TemplateCopyError(`Copy key "${key}" does not point at a module of the definition`);
  }

  let cursor: unknown = module.data;
  for (const segment of path.slice(0, -1)) {
    cursor = (cursor as Record<string, unknown> | undefined)?.[segment];
  }
  const leaf = path[path.length - 1];
  if (
    typeof cursor !== 'object' ||
    cursor === null ||
    typeof (cursor as never)[leaf] !== 'string'
  ) {
    throw new TemplateCopyError(
      `Copy key "${key}" does not point at a text field of the definition`,
    );
  }
  (cursor as Record<string, unknown>)[leaf] = value;
}

/**
 * Pure: returns a deep copy of the definition's layout with every copy key written into its text
 * field and the `{{brandName}}`/`{{tagline}}` placeholders replaced by the tenant's identity. The
 * input is never mutated, and the result carries no interpolation language.
 */
export function applyTemplateCopy(
  layout: readonly HotsiteModuleResponse[],
  copy: TemplateCopy,
  identity: TemplateIdentity,
): HotsiteModuleResponse[] {
  const result = structuredClone(layout) as HotsiteModuleResponse[];
  for (const [key, value] of Object.entries(copy)) {
    setLeaf(result, key, interpolate(key, value, identity));
  }
  return result;
}
