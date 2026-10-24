import { Injectable } from '@nestjs/common';
import {
  buildTemplateManifest,
  CATALOGUE_TEMPLATE_IDS,
  deriveCapabilities,
  getTemplateDefinition,
  isCatalogueTemplateId,
  isRegisteredCatalogueAssetPath,
} from '@ikaro/hotsite-templates';
import {
  ITemplateCatalogue,
  MaterializedTemplate,
  TemplateCatalogueEntry,
  TemplateCatalogueIdentity,
  TemplateCatalogueLocale,
} from '../../application/ports/template-catalogue.port';
import { HotsiteBranding, HotsiteModule } from '../../domain/hotsite-config.aggregate';

/**
 * Adapter over @ikaro/hotsite-templates, whose definitions are bundled into the backend build.
 * The catalogue is immutable, so nothing here reads storage or the database.
 */
@Injectable()
export class PackageTemplateCatalogueAdapter implements ITemplateCatalogue {
  list(): TemplateCatalogueEntry[] {
    return CATALOGUE_TEMPLATE_IDS.map((id) => {
      const definition = getTemplateDefinition(id);
      return {
        id,
        version: definition.version,
        thumbnailPath: definition.thumbnail,
        capabilities: deriveCapabilities(definition),
      };
    });
  }

  materialize(
    templateId: string,
    locale: TemplateCatalogueLocale,
    identity: TemplateCatalogueIdentity,
  ): MaterializedTemplate | null {
    if (!isCatalogueTemplateId(templateId)) return null;
    const definition = getTemplateDefinition(templateId);
    return {
      id: templateId,
      version: definition.version,
      // A definition's branding is presentation only: tenant identity is the caller's to preserve.
      branding: { ...definition.branding } as Partial<HotsiteBranding>,
      layout: buildTemplateManifest(templateId, locale, identity).layout as HotsiteModule[],
    };
  }

  isRegisteredAssetPath(path: string): boolean {
    return isRegisteredCatalogueAssetPath(path);
  }
}
