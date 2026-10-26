import { Injectable, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

/** Throws ZodError on failure; HttpErrorFilter maps it to 400 VALIDATION_FAILED. */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    return this.schema.parse(value);
  }
}
