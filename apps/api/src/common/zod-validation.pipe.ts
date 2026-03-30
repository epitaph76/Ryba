import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

import { ApiException } from './api-exception';

@Injectable()
export class ZodValidationPipe<TSchema extends z.ZodTypeAny>
  implements PipeTransform<unknown, z.infer<TSchema>>
{
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    const parsed = this.schema.safeParse(value);

    if (parsed.success) {
      return parsed.data;
    }

    throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', {
      issues: parsed.error.issues,
    });
  }
}
