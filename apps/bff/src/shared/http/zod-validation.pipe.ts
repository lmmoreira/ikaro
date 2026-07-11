import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
import { deriveViolation, ValidationProblemDetail } from '@ikaro/types';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value, { reportInput: true });
    if (!result.success) {
      const violations = result.error.issues.map(deriveViolation);
      const body: ValidationProblemDetail = {
        type: 'about:blank',
        title: 'Bad Request',
        status: 400,
        detail: 'Request body validation failed',
        violations,
      };
      throw new BadRequestException(body);
    }
    return result.data;
  }
}
