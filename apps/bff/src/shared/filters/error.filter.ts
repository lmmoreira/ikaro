import { Catch, Injectable } from '@nestjs/common';
import { BaseErrorFilter } from '@ikaro/nestjs-http';
import { AppLogger } from '../observability/app-logger';

@Catch()
@Injectable()
export class ErrorFilter extends BaseErrorFilter {
  constructor() {
    super(new AppLogger(ErrorFilter.name));
  }
}
