import type { HotsiteTemplateId } from '@ikaro/types';
import beloautoDefinition from '../definitions/beloauto.json';
import casa47Definition from '../definitions/casa47.json';
import clinicaLumeDefinition from '../definitions/clinica-lume.json';
import lumeStudioDefinition from '../definitions/lume-studio.json';
import mimoPetDefinition from '../definitions/mimo-pet.json';
import origemDefinition from '../definitions/origem.json';
import beloautoEn from '../copy/en/beloauto.json';
import casa47En from '../copy/en/casa47.json';
import clinicaLumeEn from '../copy/en/clinica-lume.json';
import lumeStudioEn from '../copy/en/lume-studio.json';
import mimoPetEn from '../copy/en/mimo-pet.json';
import origemEn from '../copy/en/origem.json';
import beloautoPtBr from '../copy/pt-BR/beloauto.json';
import casa47PtBr from '../copy/pt-BR/casa47.json';
import clinicaLumePtBr from '../copy/pt-BR/clinica-lume.json';
import lumeStudioPtBr from '../copy/pt-BR/lume-studio.json';
import mimoPetPtBr from '../copy/pt-BR/mimo-pet.json';
import origemPtBr from '../copy/pt-BR/origem.json';
import { TemplateCopy, TemplateDefinition, TemplateLocale } from './types';

// The JSON files are the source of truth; the unit tests run every definition (merged with each
// locale's copy) through the shared manifest schema, so the one cast below is proven at CI time.
const asDefinition = (json: unknown): TemplateDefinition => json as TemplateDefinition;

const DEFINITIONS: Readonly<Record<HotsiteTemplateId, TemplateDefinition>> = {
  beloauto: asDefinition(beloautoDefinition),
  casa47: asDefinition(casa47Definition),
  'mimo-pet': asDefinition(mimoPetDefinition),
  origem: asDefinition(origemDefinition),
  'clinica-lume': asDefinition(clinicaLumeDefinition),
  'lume-studio': asDefinition(lumeStudioDefinition),
};

const COPY: Readonly<Record<TemplateLocale, Readonly<Record<HotsiteTemplateId, TemplateCopy>>>> = {
  'pt-BR': {
    beloauto: beloautoPtBr,
    casa47: casa47PtBr,
    'mimo-pet': mimoPetPtBr,
    origem: origemPtBr,
    'clinica-lume': clinicaLumePtBr,
    'lume-studio': lumeStudioPtBr,
  },
  en: {
    beloauto: beloautoEn,
    casa47: casa47En,
    'mimo-pet': mimoPetEn,
    origem: origemEn,
    'clinica-lume': clinicaLumeEn,
    'lume-studio': lumeStudioEn,
  },
};

/**
 * The templates offered in the picker, in display order. Retiring a template means removing its
 * id here and from HOTSITE_TEMPLATE_IDS; its definition and assets stay forever, because tenants
 * that applied it still reference its shared image paths.
 */
export const CATALOGUE_TEMPLATE_IDS: readonly HotsiteTemplateId[] = [
  'beloauto',
  'casa47',
  'mimo-pet',
  'origem',
  'clinica-lume',
  'lume-studio',
];

export function isCatalogueTemplateId(value: string): value is HotsiteTemplateId {
  return (CATALOGUE_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function getTemplateDefinition(id: HotsiteTemplateId): TemplateDefinition {
  return DEFINITIONS[id];
}

export function getTemplateCopy(id: HotsiteTemplateId, locale: TemplateLocale): TemplateCopy {
  return COPY[locale][id];
}

export function listCatalogueDefinitions(): TemplateDefinition[] {
  return CATALOGUE_TEMPLATE_IDS.map((id) => DEFINITIONS[id]);
}
