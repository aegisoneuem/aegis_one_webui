import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { badRequest } from '../errors';

/**
 * Request validation driven by the OpenAPI contract.
 *
 * The contract is the single source of truth, so the server compiles its
 * schemas rather than restating them. Every request body in the spec sets
 * `additionalProperties: false`, which Ajv enforces here — that is what stops
 * mass assignment: a client cannot smuggle `role: "Super Admin"` into a
 * profile update, because the field is simply not in the schema.
 */

export interface OperationSchema {
  /** From `x-required-permission`. */
  permission?: string;
  /** From `x-csrf`. */
  csrf?: boolean;
  validateBody?: ValidateFunction;
}

export interface LoadedContract {
  /** `GET /api/v1/devices` -> operation metadata. */
  operations: Map<string, OperationSchema>;
  /** Permission list per role, from the document-level `x-roles`. */
  roles: Record<string, string[]>;
  version: string;
  operationCount: number;
}

interface SpecOperation {
  operationId?: string;
  'x-required-permission'?: string;
  'x-csrf'?: boolean;
  requestBody?: { content?: Record<string, { schema?: unknown }> };
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

export function loadContract(specPath: string, basePath: string): LoadedContract {
  const raw: unknown = parse(readFileSync(specPath, 'utf8'));
  if (typeof raw !== 'object' || raw === null) throw new Error(`Could not parse ${specPath}`);

  const spec = raw as {
    info?: { version?: string };
    paths?: Record<string, Record<string, SpecOperation>>;
    components?: { schemas?: Record<string, unknown> };
    'x-roles'?: Record<string, string[]>;
  };

  const ajv = new Ajv({
    strict: false,
    allErrors: true,
    // Dates and emails in the spec are real constraints, not documentation.
    coerceTypes: false,
    removeAdditional: false,
  });
  addFormats(ajv);

  // Register every component schema under its $ref path so bodies can point at them.
  for (const [name, schema] of Object.entries(spec.components?.schemas ?? {})) {
    ajv.addSchema(schema as object, `#/components/schemas/${name}`);
  }

  const operations = new Map<string, OperationSchema>();
  let operationCount = 0;

  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op?.operationId) continue;
      operationCount++;

      const bodySchema = op.requestBody?.content?.['application/json']?.schema;
      let validateBody: ValidateFunction | undefined;
      if (bodySchema) {
        try {
          validateBody = ajv.compile(bodySchema as object);
        } catch (err) {
          throw new Error(`Could not compile the request schema for ${op.operationId}`, {
            cause: err,
          });
        }
      }

      operations.set(routeKey(method.toUpperCase(), `${basePath}${path}`), {
        ...(op['x-required-permission'] ? { permission: op['x-required-permission'] } : {}),
        ...(op['x-csrf'] ? { csrf: true } : {}),
        ...(validateBody ? { validateBody } : {}),
      });
    }
  }

  return {
    operations,
    roles: spec['x-roles'] ?? {},
    version: spec.info?.version ?? 'unknown',
    operationCount,
  };
}

/** Fastify reports route patterns as `/api/v1/devices/:deviceId`; the spec uses `{deviceId}`. */
export function routeKey(method: string, specPath: string): string {
  return `${method} ${specPath.replace(/\{([^}]+)\}/g, ':$1')}`;
}

export function assertValidBody(schema: OperationSchema, body: unknown): void {
  if (!schema.validateBody) return;
  if (schema.validateBody(body)) return;

  const fields: Record<string, string> = {};
  for (const error of schema.validateBody.errors ?? []) {
    const path = error.instancePath.replace(/^\//, '').replace(/\//g, '.') || '(body)';
    // Ajv's own wording is developer-facing but says nothing about internals.
    fields[path] = error.message ?? 'invalid';
  }
  throw badRequest('Some of the values sent are not valid.', fields);
}
