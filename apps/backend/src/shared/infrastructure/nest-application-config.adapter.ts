import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IApplicationConfig } from '../ports/application-config.port';

@Injectable()
export class NestApplicationConfigAdapter implements IApplicationConfig {
  constructor(private readonly config: ConfigService) {}

  getOrThrow(key: string): string {
    return this.config.getOrThrow<string>(key);
  }
}
