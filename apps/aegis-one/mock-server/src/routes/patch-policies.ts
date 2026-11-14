import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { badRequest, conflict, notFound, type Db } from '@aegis/mock-core';

/**
 * Patch policy writes: create, copy, open, suspend and delete.
 *
 * The list was declared and served; nothing else was, which is why the
 * approved Patch Policies tab rendered New Policy, Open, Suspend, Copy and
 * Delete and none of them did anything.
 *
 * A new policy covers nothing until it is evaluated. It is created suspended
 * with no computers and no patches, because a policy that claimed coverage it
 * had not calculated would be a policy an administrator trusted wrongly.
 */

interface PolicyRow extends Record<string, unknown> {
  id: string;
  name: string;
  content: string;
  patchCount: number;
  rollout: string;
  computers: number;
  compliancePct: number;
  schedule: string;
  nextRunAt: string | null;
  status: string;
}

const POLICY_FIELDS = `id, name, content, patch_count AS patchCount, rollout,
                       computers, compliance_pct AS compliancePct, schedule,
                       next_run_at AS nextRunAt, status`;

const RINGS = new Set(['pilot', 'broad', 'late']);

export function registerPatchPolicyRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  const shape = (row: PolicyRow) => ({
    id: row.id,
    name: row.name,
    content: row.content,
    patchCount: row.patchCount,
    rollout: JSON.parse(row.rollout) as string[],
    computers: row.computers,
    compliancePct: row.compliancePct,
    schedule: row.schedule,
    nextRunAt: row.nextRunAt,
    status: row.status,
  });

  const read = (id: string) =>
    db.prepare(`SELECT ${POLICY_FIELDS} FROM patch_policies WHERE id = ?`).get(id) as
      PolicyRow | undefined;

  app.get(`${basePath}/patch-policies/:policyId`, async (request) => {
    const { policyId } = request.params as { policyId: string };
    const row = read(policyId);
    if (!row) throw notFound(`No patch policy with id ${policyId}.`);
    return shape(row);
  });

  app.post(`${basePath}/patch-policies`, async (request, reply) => {
    const body = request.body as {
      name: string;
      content?: string;
      rollout?: string[];
      schedule?: string;
      copyOf?: string;
    };

    /*
     * Copy takes the source's content, rollout and schedule but none of its
     * results. A copy that inherited the original's compliance figure would
     * be reporting another policy's work as its own.
     */
    const source = body.copyOf ? read(body.copyOf) : undefined;
    if (body.copyOf && !source) {
      throw badRequest('There is no policy to copy.', { copyOf: 'unknown' });
    }

    const rollout = body.rollout ?? (source ? (JSON.parse(source.rollout) as string[]) : ['broad']);
    const unknown = rollout.filter((ring) => !RINGS.has(ring));
    if (unknown.length > 0) throw badRequest('Unknown rollout ring.', { rollout: 'invalid' });

    const name = body.name.trim();
    if (db.prepare(`SELECT id FROM patch_policies WHERE name = ?`).get(name)) {
      throw conflict('A policy with that name already exists.');
    }

    const id = `pol-${randomUUID().slice(0, 8)}`;
    db.prepare(
      `INSERT INTO patch_policies
         (id,name,content,patch_count,rollout,computers,compliance_pct,schedule,next_run_at,status)
       VALUES (?,?,?,0,?,0,0,?,NULL,'suspended')`,
    ).run(
      id,
      name,
      body.content ?? source?.content ?? 'Any OS · Critical/High',
      JSON.stringify(rollout),
      body.schedule ?? source?.schedule ?? 'Monthly',
    );

    return reply.code(201).send(shape(read(id) as PolicyRow));
  });

  app.patch(`${basePath}/patch-policies/:policyId`, async (request) => {
    const { policyId } = request.params as { policyId: string };
    const row = read(policyId);
    if (!row) throw notFound(`No patch policy with id ${policyId}.`);

    const { status } = request.body as { status: string };

    /*
     * Suspending clears the next run. A suspended policy that still showed a
     * date would be promising work it will not do, and resuming has to
     * recalculate it anyway.
     */
    db.prepare(
      `UPDATE patch_policies
          SET status = ?, next_run_at = CASE WHEN ? = 'suspended' THEN NULL ELSE next_run_at END
        WHERE id = ?`,
    ).run(status, status, policyId);

    return shape(read(policyId) as PolicyRow);
  });

  app.delete(`${basePath}/patch-policies/:policyId`, async (request, reply) => {
    const { policyId } = request.params as { policyId: string };
    const row = read(policyId);
    if (!row) throw notFound(`No patch policy with id ${policyId}.`);

    /*
     * An active policy is deploying to endpoints right now. Deleting it would
     * stop that mid-flight with nothing recording why, so it has to be
     * suspended first — a deliberate second step, not an obstacle.
     */
    if (row.status === 'active') {
      throw conflict('Suspend the policy before deleting it.');
    }

    db.prepare(`DELETE FROM patch_policies WHERE id = ?`).run(policyId);
    return reply.code(204).send();
  });
}
