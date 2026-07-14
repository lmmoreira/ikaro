import { Injectable } from '@nestjs/common';
import { BaseErrorInterceptor } from '@ikaro/nestjs-http';
import { AppLogger } from '../observability/app-logger';

@Injectable()
export class ErrorInterceptor extends BaseErrorInterceptor {
  constructor() {
    super(new AppLogger(ErrorInterceptor.name));
  }
}
