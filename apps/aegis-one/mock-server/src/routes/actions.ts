import { createHash, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { badRequest, conflict, notFound, zoneScope, type Db } from '@aegis/mock-core';
import { clearAggregates } from './aggregates';
import { shapeRow, toListQuery } from './resources';

/**
 * State-changing endpoints: submitting work, cancelling it, and managing API
 * tokens.
 *
 * Every one of these is already behind the contract-driven permission and CSRF
 * checks in the app factory; what the handlers add is the per-object rules —
 * target resolution, zone scoping, and the limits on what a job may contain.
 */

const MAX_EXPLICIT_TARGETS = 5000;
/** The contract caps per-endpoint output at 256 KiB; the server enforces it. */
const MAX_STDOUT_BYTES = 262_144;

/** Exactly the contract's `TargetSelection`. */
interface TargetSelection {
  deviceIds?: string[];
  groupIds?: string[];
  hostnames?: string[];
  zone?: string;
  /** Serialised filter, applied server-side; this is how "all 12,480 matching" works. */
  filter?: string;
}

/**
 * Turns a target selection into the device ids it actually means.
 *
 * Resolution happens here, not on the client: a client that posted 12,480 ids
 * would be asserting a filter result the server never checked, and a scoped
 * role could name devices outside its zones.
 */
function resolveTargets(db: Db, selection: TargetSelection, zoneIds: readonly string[]): string[] {
  const scope = zoneScope({ zoneIds: [...zoneIds] });
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (selection.deviceIds?.length) {
    if (selection.deviceIds.length > MAX_EXPLICIT_TARGETS) {
      throw badRequest(
        `Select at most ${MAX_EXPLICIT_TARGETS} devices explicitly, or target a group or a filter.`,
      );
    }
    clauses.push(`id IN (${selection.deviceIds.map(() => '?').join(',')})`);
    params.push(...selection.deviceIds);
  }

  if (selection.hostnames?.length) {
    clauses.push(`hostname IN (${selection.hostnames.map(() => '?').join(',')})`);
    params.push(...selection.hostnames);
  }

  if (selection.zone) {
    clauses.push('zone_id = ?');
    params.push(selection.zone);
  }

  if (selection.groupIds?.length) {
    // Group membership is materialised, so a group target resolves to the
    // devices that are actually in it rather than to a stated size.
    const placeholders = selection.groupIds.map(() => '?').join(',');
    const known = db
      .prepare(`SELECT COUNT(*) AS n FROM device_groups WHERE id IN (${placeholders})`)
      .get(...selection.groupIds) as { n: number };
    if (known.n === 0) throw notFound('No such group.');

    clauses.push(`id IN (SELECT device_id FROM group_members WHERE group_id IN (${placeholders}))`);
    params.push(...selection.groupIds);
  }

  // The filter is the console's own query string, re-run here against the
  // same allowlist the list endpoint uses. Only declared keys are honoured;
  // anything else is dropped rather than reaching SQL.
  if (selection.filter) {
    const parsed = new URLSearchParams(selection.filter);
    const allowed: Record<string, string> = {
      status: 'status',
      osFamily: 'os_family',
      kind: 'kind',
    };
    for (const [key, column] of Object.entries(allowed)) {
      const value = parsed.get(key);
      if (!value) continue;
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }

  if (clauses.length === 0 && !selection.groupIds?.length) {
    throw badRequest('Choose at least one target.');
  }

  const where = [clauses.length ? `(${clauses.join(' OR ')})` : '1=1', scope?.sql]
    .filter(Boolean)
    .join(' AND ');
  const limit = selection.groupIds?.length ? 20_000 : MAX_EXPLICIT_TARGETS;

  const rows = db
    .prepare(`SELECT id FROM devices WHERE ${where} LIMIT ?`)
    .all(...params, ...(scope?.params ?? []), limit) as { id: string }[];

  if (rows.length === 0) throw badRequest('That selection matches no devices you can see.');
  return rows.map((r) => r.id);
}

/**
 * A scan's scope, which is not a job's target list.
 *
 * Submitting work to endpoints names them, and `resolveTargets` refuses an
 * empty selection for exactly that reason. A scan is the opposite: "All
 * devices" is its default and its commonest scope, so an empty selection
 * means the whole estate the caller can see rather than nothing at all. It
 * is still resolved server-side, so a zone-scoped caller cannot scan outside
 * their zones.
 */
function resolveScanScope(
  db: Db,
  selection: TargetSelection,
  zoneIds: readonly string[],
): { count: number; label: string } {
  const scope = zoneScope({ zoneIds: [...zoneIds] });
  const clauses: string[] = [];
  const params: unknown[] = [];
  let label = 'All devices';

  if (selection.zone) {
    clauses.push('zone_id = ?');
    params.push(selection.zone);
    label = `Zone: ${selection.zone}`;
  }

  if (selection.groupIds?.length) {
    const placeholders = selection.groupIds.map(() => '?').join(',');
    clauses.push(`id IN (SELECT device_id FROM group_members WHERE group_id IN (${placeholders}))`);
    params.push(...selection.groupIds);
    label = `Device groups: ${selection.groupIds.length}`;
  }

  // The only filter a scan takes is the platform, matched as a prefix:
  // os_family holds "Windows 11" and "Red Hat Enterprise Linux 9", not a
  // family name on its own.
  const family = selection.filter ? new URLSearchParams(selection.filter).get('osFamily') : null;
  if (family) {
    clauses.push('os_family LIKE ?');
    params.push(`${family}%`);
    label = `Platform: ${family}`;
  }

  const where = [clauses.length ? `(${clauses.join(' AND ')})` : '1=1', scope?.sql]
    .filter(Boolean)
    .join(' AND ');
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM devices WHERE ${where}`)
    .get(...params, ...(scope?.params ?? [])) as { n: number };

  return { count: row.n, label };
}

export function registerActionRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  /**
   * Submit a remote script-execution job.
   *
   * Non-interactive by construction: the response is a job id to poll. There
   * is no socket, no attach and no way to send a second command to a running
   * job — that is the difference between running a script and remote control.
   */
  app.post(`${basePath}/liveops/script-jobs`, async (request, reply) => {
    const body = request.body as {
      kind?: 'live-data' | 'script' | 'log-collection';
      name?: string;
      changeRef?: string;
      targets?: TargetSelection;
      timeoutSeconds?: number;
      outputLimitKb?: number;
      liveData?: { fields: string[] };
      script?: { language: string; body: string };
      logCollection?: { sources: string[]; customPaths?: string[] };
    };

    if (!body.kind || !body.name || !body.targets)
      throw badRequest('kind, name and targets are required.');
    if (body.kind === 'script' && !body.script?.body)
      throw badRequest('A script job needs a script.');
    if (body.kind === 'live-data' && !body.liveData?.fields?.length) {
      throw badRequest('A live data job needs at least one field.');
    }
    if (body.kind === 'log-collection' && !body.logCollection?.sources?.length) {
      throw badRequest('A log collection job needs at least one source.');
    }

    const targets = resolveTargets(db, body.targets, request.auth?.zoneIds ?? []);
    const jobId = `job-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO live_jobs
         (id,title,kind,script_language,script,change_ref,status,target_count,
          queued,running,succeeded,failed,timed_out,offline,cancelled,
          submitted_at,submitted_by,timeout_seconds,output_limit_kb)
       VALUES (?,?,?,?,?,?,'queued',?,?,0,0,0,0,0,0,?,?,?,?)`,
    ).run(
      jobId,
      body.name,
      body.kind,
      body.script?.language ?? null,
      // Stored verbatim. It is data, never evaluated here, and the console
      // renders it as text.
      body.script?.body ?? null,
      body.changeRef ?? null,
      targets.length,
      // Nothing has run yet, so every target is queued.
      targets.length,
      now,
      request.auth?.email ?? 'unknown',
      Math.min(Math.max(body.timeoutSeconds ?? 300, 5), 3600),
      Math.min(Math.max(body.outputLimitKb ?? 64, 1), 256),
    );

    db.prepare(
      `INSERT INTO audit_log (id,at,actor,actor_role,action,object_type,object_id,outcome,ip,detail)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      `aud-${randomUUID().slice(0, 8)}`,
      now,
      request.auth?.email ?? 'unknown',
      request.auth?.role ?? 'unknown',
      body.kind === 'script' ? 'liveops.script.submit' : `liveops.${body.kind}.submit`,
      'live-job',
      jobId,
      'success',
      request.ip,
      `${targets.length} endpoints`,
    );

    request.log.info({ event: 'liveops.submit', jobId, targets: targets.length }, 'job queued');
    // The contract's LiveJob, so the console can show the new row without
    // fetching it back.
    return reply.status(202).send({
      id: jobId,
      title: body.name,
      kind: body.kind,
      status: 'queued',
      targetCount: targets.length,
      counts: {
        queued: targets.length,
        running: 0,
        succeeded: 0,
        failed: 0,
        timedOut: 0,
        offline: 0,
        cancelled: 0,
      },
      submittedBy: request.auth?.email ?? 'unknown',
      submittedAt: now,
      ...(body.changeRef ? { changeRef: body.changeRef } : {}),
      ...(body.script?.language ? { scriptLanguage: body.script.language } : {}),
    });
  });

  app.get(`${basePath}/liveops/script-jobs/:jobId/results`, async (request) => {
    const { jobId } = request.params as { jobId: string };
    const job = db.prepare(`SELECT id FROM live_jobs WHERE id = ?`).get(jobId);
    if (!job) throw notFound();

    const query = toListQuery(request);
    const limit = Math.min(Number(query.limit) || 50, 200);
    // Exactly the fields the contract's LiveJobResult declares.
    const rows = db
      .prepare(
        `SELECT device_id AS deviceId, device_name AS deviceName, connection,
                action_id AS actionId, action_type AS actionType, status,
                exit_code AS exitCode, reason, detail, stdout, stderr,
                queued_at AS queuedAt, started_at AS startedAt, finished_at AS finishedAt
         FROM live_job_results WHERE job_id = ? ORDER BY device_name LIMIT ?`,
      )
      .all(jobId, limit) as Record<string, unknown>[];

    return {
      items: rows.map((row) => ({
        ...shapeRow(row),
        // Truncated server-side as well as client-side. Output comes from the
        // endpoint, so it is untrusted, and the console renders it as text.
        stdout: truncate(row['stdout']),
        stderr: truncate(row['stderr']),
      })),
      page: { nextCursor: null, total: rows.length },
    };
  });

  app.delete(`${basePath}/liveops/script-jobs/:jobId`, async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const job = db.prepare(`SELECT status FROM live_jobs WHERE id = ?`).get(jobId) as
      { status: string } | undefined;
    if (!job) throw notFound();
    if (job.status === 'completed' || job.status === 'cancelled') {
      throw conflict('That job has already finished.');
    }
    db.prepare(`UPDATE live_jobs SET status = 'cancelled', finished_at = ? WHERE id = ?`).run(
      new Date().toISOString(),
      jobId,
    );
    return reply.status(204).send();
  });

  /**
   * Start a vulnerability scan, or schedule one.
   *
   * A scan is a job the server owns: the console asks for it and reads the
   * result back from the Scans tab. The targets are resolved here, so a
   * zone-scoped caller cannot scan outside their zones by naming devices.
   */
  app.post(`${basePath}/vulnerabilities/scans`, async (request, reply) => {
    const body = request.body as {
      name?: string;
      template?: string;
      targets?: TargetSelection;
      schedule?: string;
      authenticated?: boolean;
    };

    if (!body.name || !body.template || !body.targets || !body.schedule)
      throw badRequest('name, template, targets and schedule are required.');

    const scope = resolveScanScope(db, body.targets, request.auth?.zoneIds ?? []);
    const scanId = `scan-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const runNow = body.schedule === 'now';

    const SCHEDULE_LABEL: Record<string, string> = {
      now: 'One-off',
      'daily-0300': 'Daily · 03:00',
      'weekly-fri-0200': 'Weekly · Friday 02:00',
      'monthly-1st-0100': 'Monthly · 1st 01:00',
    };

    db.prepare(
      `INSERT INTO vuln_scans
         (id,name,template,scope,schedule,status,started_at,finished_at,
          duration_label,devices_scanned,findings_opened,findings_fixed)
       VALUES (?,?,?,?,?,?,?,NULL,?,?,0,0)`,
    ).run(
      scanId,
      body.name,
      body.template,
      scope.label,
      SCHEDULE_LABEL[body.schedule] ?? body.schedule,
      runNow ? 'running' : 'queued',
      now,
      runNow ? 'running…' : '—',
      // Nothing has been scanned yet; the figure is what the scan will reach.
      runNow ? 0 : 0,
    );

    db.prepare(
      `INSERT INTO audit_log (id,at,actor,actor_role,action,object_type,object_id,outcome,ip,detail)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      `aud-${randomUUID().slice(0, 8)}`,
      now,
      request.auth?.email ?? 'unknown',
      request.auth?.role ?? 'unknown',
      runNow ? 'vulnerabilities.scan.start' : 'vulnerabilities.scan.schedule',
      'scan',
      scanId,
      'success',
      request.ip,
      `${scope.count} endpoints · ${body.authenticated === false ? 'unauthenticated' : 'authenticated'}`,
    );

    // The contract's Scan, so the Scans tab can show the new row without
    // fetching the page back.
    return reply.status(202).send({
      id: scanId,
      name: body.name,
      template: body.template,
      schedule: SCHEDULE_LABEL[body.schedule] ?? body.schedule,
      status: runNow ? 'running' : 'queued',
      startedAt: now,
      finishedAt: null,
      durationLabel: runNow ? 'running…' : '—',
      scope: scope.label,
      devicesScanned: 0,
      findingsOpened: 0,
      findingsFixed: 0,
    });
  });

  /** Create a deployment. Targets are resolved here for the same reason as jobs. */
  app.post(`${basePath}/deployments`, async (request, reply) => {
    const body = request.body as {
      type?: string;
      name?: string;
      content?: { packageId?: string; patchIds?: string[]; policyId?: string };
      targets?: TargetSelection;
      schedule?: { mode?: 'now' | 'later'; startAt?: string };
      network?: { wakeOfflineFirst?: boolean };
      options?: { notes?: string };
    };

    if (!body.type || !body.name || !body.targets)
      throw badRequest('type, name and targets are required.');

    const targets = resolveTargets(db, body.targets, request.auth?.zoneIds ?? []);
    const deploymentId = `dep-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const scheduled = body.schedule?.mode === 'later';

    // The grid names the first few targets under the count, so they are read
    // once here rather than joined back out of the results on every list.
    const head = targets.slice(0, 3);
    const preview = head.length
      ? (
          db
            .prepare(
              `SELECT hostname FROM devices WHERE id IN (${head.map(() => '?').join(',')}) ORDER BY hostname`,
            )
            .all(...head) as { hostname: string }[]
        ).map((row) => row.hostname)
      : [];

    const contentLabel =
      body.content?.packageId ??
      (body.content?.patchIds?.length ? `${body.content.patchIds.length} patches` : undefined) ??
      body.content?.policyId ??
      'unspecified';

    db.prepare(
      `INSERT INTO deployments (id,name,type,status,package,target_count,target_preview,done,failed,pending,triggered_at,triggered_by,starts_at,wake_offline_first,notes)
       VALUES (?,?,?,?,?,?,?,0,0,?,?,?,?,?,?)`,
    ).run(
      deploymentId,
      body.name,
      body.type,
      scheduled ? 'scheduled' : 'running',
      contentLabel,
      targets.length,
      preview.join(','),
      targets.length,
      now,
      request.auth?.email ?? 'unknown',
      scheduled ? (body.schedule?.startAt ?? null) : null,
      body.network?.wakeOfflineFirst ? 1 : 0,
      body.options?.notes ?? null,
    );

    db.prepare(
      `INSERT INTO audit_log (id,at,actor,actor_role,action,object_type,object_id,outcome,ip,detail)
       VALUES (?,?,?,?,'deployment.create','deployment',?,'success',?,?)`,
    ).run(
      `aud-${randomUUID().slice(0, 8)}`,
      now,
      request.auth?.email ?? 'unknown',
      request.auth?.role ?? 'unknown',
      deploymentId,
      request.ip,
      `${targets.length} endpoints`,
    );

    // The six counters above the grid have just changed.
    clearAggregates();

    // The contract's DeploymentSummary, which is what a 201 returns.
    return reply.status(201).send({
      id: deploymentId,
      name: body.name,
      type: body.type,
      status: scheduled ? 'scheduled' : 'running',
      package: contentLabel,
      targetCount: targets.length,
      targetPreview: preview,
      counts: { done: 0, failed: 0, pending: targets.length },
      triggeredBy: request.auth?.email ?? 'unknown',
      triggeredAt: now,
      startsAt: scheduled ? (body.schedule?.startAt ?? null) : null,
    });
  });

  app.get(`${basePath}/deployments/:deploymentId/results`, async (request) => {
    const { deploymentId } = request.params as { deploymentId: string };
    const exists = db.prepare(`SELECT id FROM deployments WHERE id = ?`).get(deploymentId);
    if (!exists) throw notFound();

    const rows = db
      .prepare(
        `SELECT r.device_id AS deviceId, d.hostname, d.zone_name AS zoneName, r.state, r.message,
                r.finished_at AS finishedAt
         FROM deployment_results r JOIN devices d ON d.id = r.device_id
         WHERE r.deployment_id = ? ORDER BY d.hostname LIMIT 200`,
      )
      .all(deploymentId) as Record<string, unknown>[];

    return { items: rows.map((r) => shapeRow(r)), page: { nextCursor: null, total: rows.length } };
  });

  /**
   * Create an API token.
   *
   * The secret is generated here, returned exactly once, and only its SHA-256
   * is stored — so it cannot be read back from the list endpoint, the database
   * or a backup.
   */
  app.post(`${basePath}/admin/api-tokens`, async (request, reply) => {
    const body = request.body as { name?: string; scopes?: string[]; expiresAt?: string };
    if (!body.name || !body.scopes?.length) throw badRequest('name and scopes are required.');

    // A token cannot be given a permission its creator does not hold.
    const own = new Set(request.auth?.permissions ?? []);
    if (!own.has('*')) {
      const over = body.scopes.filter((s) => !own.has(s) && !own.has(`${s.split(':')[0]}:*`));
      if (over.length)
        throw badRequest('A token cannot be given permissions you do not have yourself.');
    }

    const secret = `aeg_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const tokenId = `tok-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    /*
     * A token with no expiry is a credential that outlives whoever created
     * it. The contract makes `expiresAt` optional and says the server
     * defaults to a year, so an omitted expiry becomes a year rather than
     * "never" — computed once here so the stored row and the response
     * cannot disagree by a millisecond.
     */
    const expiresAt = body.expiresAt ?? new Date(Date.now() + 365 * 86_400_000).toISOString();

    db.prepare(
      `INSERT INTO api_tokens (id,name,token_hash,prefix,scopes,created_at,created_by,expires_at)
       VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      tokenId,
      body.name,
      createHash('sha256').update(secret).digest('hex'),
      secret.slice(0, 11),
      JSON.stringify(body.scopes),
      now,
      request.auth?.email ?? 'unknown',
      expiresAt,
    );

    return reply.status(201).send({
      id: tokenId,
      name: body.name,
      prefix: secret.slice(0, 11),
      scopes: body.scopes,
      createdAt: now,
      expiresAt,
      // Shown once. There is no endpoint that can return it again.
      secret,
    });
  });

  app.delete(`${basePath}/admin/api-tokens/:tokenId`, async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    const row = db.prepare(`SELECT revoked_at FROM api_tokens WHERE id = ?`).get(tokenId) as
      { revoked_at: string | null } | undefined;
    if (!row) throw notFound();
    if (row.revoked_at) throw conflict('That token is already revoked.');

    const now = new Date().toISOString();
    db.prepare(`UPDATE api_tokens SET revoked_at = ? WHERE id = ?`).run(now, tokenId);
    db.prepare(
      `INSERT INTO audit_log (id,at,actor,actor_role,action,object_type,object_id,outcome,ip,detail)
       VALUES (?,?,?,?,'token.revoke','api-token',?,'success',?,NULL)`,
    ).run(
      `aud-${randomUUID().slice(0, 8)}`,
      now,
      request.auth?.email ?? 'unknown',
      request.auth?.role ?? 'unknown',
      tokenId,
      request.ip,
    );
    return reply.status(204).send();
  });
}

function truncate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const buffer = Buffer.from(value, 'utf8');
  if (buffer.length <= MAX_STDOUT_BYTES) return value;
  return `${buffer.subarray(0, MAX_STDOUT_BYTES).toString('utf8')}\n… truncated at 256 KiB`;
}
