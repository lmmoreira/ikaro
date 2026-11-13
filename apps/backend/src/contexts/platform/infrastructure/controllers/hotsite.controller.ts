import { Controller, Get } from '@nestjs/common';
import { RequiresFeature, SuspensionAccess } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  GetHotsiteManifestUseCase,
  GetHotsiteManifestUseCaseResult,
} from '../../application/use-cases/get-hotsite-manifest.use-case';
import { mapPlatformError } from '../http/platform-error.mapper';

@Controller('hotsite')
@RequiresFeature('HOTSITE')
@SuspensionAccess('PUBLIC_MANIFEST')
export class HotsiteController {
  constructor(
    private readonly ctx: RequestContext,
    private readonly getHotsiteManifest: GetHotsiteManifestUseCase,
  ) {}

  @Get()
  getManifest(): Promise<GetHotsiteManifestUseCaseResult> {
    return this.getHotsiteManifest.execute({ tenantId: this.ctx.tenantId }).catch(mapPlatformError);
  }
}
