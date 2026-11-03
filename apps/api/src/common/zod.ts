import { ArgumentMetadata, BadRequestException, PipeTransform, applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import type { ZodTypeAny, z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/** Validates a request body or query with a Zod schema shared with the front-end. */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown, _meta: ArgumentMetadata): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new BadRequestException({
        message: 'Données invalides',
        code: 'VALIDATION_ERROR',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

/** Documents a Zod body in the OpenAPI spec. */
export function ApiZodBody(schema: ZodTypeAny) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return applyDecorators(ApiBody({ schema: zodToJsonSchema(schema, { target: 'openApi3' }) as any }));
}

/** Documents the keys of a Zod object used as query string. */
export function ApiZodQuery(schema: ZodTypeAny) {
  const json = zodToJsonSchema(schema, { target: 'openApi3' }) as { properties?: Record<string, unknown> };
  return applyDecorators(
    ...Object.keys(json.properties ?? {}).map((name) => ApiQuery({ name, required: false })),
  );
}
