// Routes are declared once, here, and used twice: they are mounted on the Express router AND described in the OpenAPI
// document, so /api/docs cannot drift away from what the server really accepts.
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { handle } from './http';

type Method = 'get' | 'post' | 'patch';

interface Def<Q extends z.ZodType, B extends z.ZodType> {
  method: Method;
  /** Express style, e.g. '/risks/:id'. */
  path: string;
  tag: string;
  summary: string;
  description?: string;
  query?: Q;
  body?: B;
  /** Documented success status. */
  status?: number;
  handler: (a: { req: Request; res: Response; query: z.output<Q>; body: z.output<B> }) => Promise<void>;
}

interface Doc { method: Method; path: string; tag: string; summary: string; description?: string; query?: z.ZodType; body?: z.ZodType; status: number }

export class Registry {
  readonly router = Router();
  private readonly docs: Doc[] = [];

  add<Q extends z.ZodType = z.ZodUndefined, B extends z.ZodType = z.ZodUndefined>(def: Def<Q, B>): void {
    this.docs.push({ method: def.method, path: def.path, tag: def.tag, summary: def.summary, description: def.description, query: def.query, body: def.body, status: def.status ?? 200 });
    this.router[def.method](
      def.path,
      handle(async (req, res) => {
        const query = (def.query ? def.query.parse(req.query) : undefined) as z.output<Q>;
        const body = (def.body ? def.body.parse(req.body) : undefined) as z.output<B>;
        await def.handler({ req, res, query, body });
      }),
    );
  }

  /** The OpenAPI 3.1 document for everything registered. Request schemas come straight from the Zod definitions. */
  openapi(info: { title: string; version: string; description: string }): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const d of this.docs) {
      const path = `/api${d.path.replace(/:(\w+)/g, '{$1}')}`;
      const parameters: unknown[] = [
        { name: 'X-Organisation-Id', in: 'header', required: false, description: 'DEV ONLY: the organisation of this request. Defaults to the first organisation.', schema: { type: 'integer' } },
        { name: 'X-Actor-Id', in: 'header', required: false, description: 'DEV ONLY: the employee acting. Required for writes.', schema: { type: 'integer' } },
        ...[...d.path.matchAll(/:(\w+)/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: 'string' } })),
      ];
      if (d.query) {
        const schema = z.toJSONSchema(d.query, { io: 'input', unrepresentable: 'any' }) as { properties?: Record<string, Record<string, unknown>>; required?: string[] };
        for (const [name, prop] of Object.entries(schema.properties ?? {})) {
          parameters.push({ name, in: 'query', required: schema.required?.includes(name) ?? false, description: prop.description, schema: prop });
        }
      }
      const operation: Record<string, unknown> = {
        tags: [d.tag],
        summary: d.summary,
        ...(d.description ? { description: d.description } : {}),
        parameters,
        responses: {
          [String(d.status)]: { description: 'Success. Bodies are { "data": ... }, lists add { "page": { limit, offset, total } }.' },
          '400': { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      };
      if (d.body) {
        operation.requestBody = {
          required: true,
          content: { 'application/json': { schema: z.toJSONSchema(d.body, { io: 'input', unrepresentable: 'any' }) } },
        };
      }
      (paths[path] ??= {})[d.method] = operation;
    }
    return {
      openapi: '3.1.0',
      info,
      servers: [{ url: '/' }],
      tags: [...new Set(this.docs.map((d) => d.tag))].map((name) => ({ name })),
      paths,
      components: {
        parameters: {},
        schemas: {
          Error: {
            type: 'object',
            required: ['error'],
            properties: {
              error: {
                type: 'object',
                required: ['code', 'message', 'details'],
                properties: {
                  code: { type: 'string', enum: ['validation_error', 'not_found', 'conflict', 'forbidden', 'actor_required', 'organisation_not_found', 'internal_error'] },
                  message: { type: 'string' },
                  details: { type: 'array', items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } } },
                },
              },
            },
          },
        },
      },
    };
  }
}
