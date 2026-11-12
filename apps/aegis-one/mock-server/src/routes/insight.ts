import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { badRequest, notFound, type Db } from '@aegis/mock-core';

/**
 * AEGIS Insight: describe a problem on one endpoint, and get the checks that
 * were run, what they point at, and what to do about it.
 *
 * The reference hard-codes its diagnosis — the root cause and the 91%
 * confidence are string literals in the preview. Here every check reads the
 * endpoint's own measures, the root cause is assembled from whichever checks
 * actually failed, and the confidence is how far they agree. A diagnosis
 * nobody can trace back to a measurement is worse than no diagnosis, and this
 * console does not print figures it cannot account for.
 *
 * The description steers which family of checks leads. It does not invent a
 * finding: an endpoint with 3% disk free reports low disk whatever the
 * complaint says, and an endpoint with nothing wrong says so.
 */

type Severity = 'critical' | 'high' | 'medium' | 'low';

interface DeviceRow extends Record<string, unknown> {
  id: string;
  name: string;
  user: string;
  os: string;
  dexScore: number;
  cpuPct: number;
  memoryPct: number;
  bootSeconds: number;
  diskFreePct: number;
  pendingPatches: number;
  criticalVulns: number;
  antivirusOk: number;
  firewallOk: number;
  encrypted: number;
  configFail: number;
  rebootPending: number;
}

const DEVICE_FIELDS = `id, hostname AS name, primary_user_name AS user, os_name AS os,
                       dex_score AS dexScore, cpu_pct AS cpuPct, memory_pct AS memoryPct,
                       boot_seconds AS bootSeconds, disk_free_pct AS diskFreePct,
                       pending_patches AS pendingPatches, critical_vulns AS criticalVulns,
                       antivirus_ok AS antivirusOk, firewall_ok AS firewallOk,
                       encrypted, config_fail AS configFail,
                       reboot_pending AS rebootPending`;

interface CheckDef {
  readonly name: string;
  /** Which complaint this check speaks to, for ordering the panel. */
  readonly family: 'performance' | 'storage' | 'stability' | 'security' | 'updates';
  /** The measure, and the bands that make it a finding. */
  readonly severityOf: (d: DeviceRow) => Severity | null;
  readonly detailOf: (d: DeviceRow) => string;
  /** What to do about it, when it is a finding. */
  readonly action?: { id: string; title: string; expected: (d: DeviceRow) => string };
}

/**
 * Every check Insight can run, with the measure behind it. A check that finds
 * nothing returns null and is reported as passing rather than hidden — an
 * administrator needs to know what was looked at, not only what failed.
 */
const CHECKS: readonly CheckDef[] = [
  {
    name: 'Low Disk Space',
    family: 'storage',
    severityOf: (d) =>
      d.diskFreePct <= 5
        ? 'critical'
        : d.diskFreePct <= 10
          ? 'high'
          : d.diskFreePct <= 25
            ? 'medium'
            : null,
    detailOf: (d) => `${d.diskFreePct}% of the disk is free`,
    action: {
      id: 'free-disk-space',
      title: 'Free Disk Space',
      expected: (d) => `+${d.diskFreePct <= 5 ? 8 : 5} DEX points`,
    },
  },
  {
    name: 'Memory Pressure',
    family: 'performance',
    severityOf: (d) => (d.memoryPct >= 90 ? 'critical' : d.memoryPct >= 75 ? 'high' : null),
    detailOf: (d) => `Memory is at ${d.memoryPct}%`,
    action: {
      id: 'restart-high-memory-application',
      title: 'Restart High-Memory Application',
      expected: () => '+3 DEX points',
    },
  },
  {
    name: 'CPU Pressure',
    family: 'performance',
    severityOf: (d) => (d.cpuPct >= 90 ? 'high' : d.cpuPct >= 75 ? 'medium' : null),
    detailOf: (d) => `Processor load is at ${d.cpuPct}%`,
  },
  {
    name: 'Startup Applications',
    family: 'performance',
    severityOf: (d) => (d.bootSeconds >= 90 ? 'high' : d.bootSeconds >= 60 ? 'medium' : null),
    detailOf: (d) => `Boot takes ${d.bootSeconds} seconds`,
    action: {
      id: 'review-startup-applications',
      title: 'Review Startup Applications',
      expected: (d) => `${Math.max(5, Math.round((d.bootSeconds - 30) / 3))} sec boot improvement`,
    },
  },
  {
    name: 'Pending Restart',
    family: 'stability',
    severityOf: (d) => (d.rebootPending === 1 ? 'medium' : null),
    detailOf: (d) =>
      d.rebootPending === 1 ? 'A restart is waiting to finish an install' : 'No restart pending',
    action: {
      id: 'restart-endpoint',
      title: 'Restart the Endpoint',
      expected: () => 'Clears the pending install',
    },
  },
  {
    name: 'Missing Updates',
    family: 'updates',
    severityOf: (d) => (d.pendingPatches >= 3 ? 'high' : d.pendingPatches > 0 ? 'medium' : null),
    detailOf: (d) => `${d.pendingPatches} update${d.pendingPatches === 1 ? '' : 's'} outstanding`,
    action: {
      id: 'deploy-missing-updates',
      title: 'Deploy Missing Updates',
      expected: (d) => `Closes ${d.pendingPatches} update${d.pendingPatches === 1 ? '' : 's'}`,
    },
  },
  {
    name: 'Endpoint Protection',
    family: 'security',
    severityOf: (d) => (d.antivirusOk === 0 ? 'critical' : null),
    detailOf: (d) => (d.antivirusOk === 0 ? 'Protection is not running' : 'Protection is running'),
    action: {
      id: 'repair-protection',
      title: 'Repair Endpoint Protection',
      expected: () => 'Protection reporting again',
    },
  },
  {
    name: 'Disk Encryption',
    family: 'security',
    severityOf: (d) => (d.encrypted === 0 ? 'high' : null),
    detailOf: (d) =>
      d.encrypted === 0 ? 'The system drive is not encrypted' : 'The system drive is encrypted',
  },
  {
    name: 'Configuration Drift',
    family: 'security',
    severityOf: (d) => (d.configFail >= 20 ? 'high' : d.configFail >= 8 ? 'medium' : null),
    detailOf: (d) => `${d.configFail} benchmark checks are failing`,
  },
  {
    name: 'Known Vulnerabilities',
    family: 'security',
    severityOf: (d) => (d.criticalVulns > 0 ? 'high' : null),
    detailOf: (d) => `${d.criticalVulns} critical finding${d.criticalVulns === 1 ? '' : 's'} open`,
  },
];

/**
 * Which family the complaint is about, from the words an administrator
 * actually types. Unmatched text leads with performance, because that is what
 * most "it's slow" tickets turn out to be.
 */
const FAMILY_WORDS: readonly (readonly [CheckDef['family'], readonly string[]])[] = [
  ['storage', ['disk', 'space', 'full', 'storage', 'save']],
  ['stability', ['crash', 'freeze', 'hang', 'restart', 'reboot', 'blue screen', 'unexpected']],
  ['security', ['virus', 'malware', 'encrypt', 'firewall', 'security', 'compliance', 'antivirus']],
  ['updates', ['update', 'patch', 'upgrade', 'install']],
  ['performance', ['slow', 'lag', 'freeze', 'memory', 'cpu', 'boot', 'startup', 'performance']],
];

function leadFamily(description: string): CheckDef['family'] {
  const text = description.toLowerCase();
  for (const [family, words] of FAMILY_WORDS) {
    if (words.some((w) => text.includes(w))) return family;
  }
  return 'performance';
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 34, high: 24, medium: 13, low: 5 };

/** The word the panel prints for a check that found nothing. */
const CLEAN: Severity = 'low';

export function registerInsightRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  app.post(`${basePath}/insight/diagnostics`, async (request) => {
    const { description, deviceId } = request.body as { description: string; deviceId: string };
    if (!description || description.trim().length < 5) {
      throw badRequest('Describe the problem in a few words before running diagnostics.');
    }

    const device = db.prepare(`SELECT ${DEVICE_FIELDS} FROM devices WHERE id = ?`).get(deviceId) as
      DeviceRow | undefined;
    if (!device) throw notFound();

    const lead = leadFamily(description);

    // Every check runs; the complaint only decides what leads the panel.
    const evaluated = CHECKS.map((check) => {
      const severity = check.severityOf(device);
      return { check, severity, finding: severity !== null };
    }).sort((a, b) => {
      const leadRank = (x: typeof a): number => (x.check.family === lead ? 0 : 1);
      return (
        leadRank(a) - leadRank(b) ||
        SEVERITY_RANK[a.severity ?? CLEAN] - SEVERITY_RANK[b.severity ?? CLEAN]
      );
    });

    const findings = evaluated.filter((e) => e.finding);

    /*
     * The root cause is the failing checks themselves, named. Confidence is
     * how far they agree: one medium finding is a guess, three criticals
     * pointing the same way is not. It is capped below certainty because a
     * diagnosis from telemetry alone never earns 100%.
     */
    const confidence = Math.min(
      94,
      findings.reduce((a, f) => a + SEVERITY_WEIGHT[f.severity ?? CLEAN], 0),
    );

    const summary =
      findings.length === 0
        ? 'No fault found in the measures Insight can see'
        : findings
            .slice(0, 3)
            .map((f) => f.check.name)
            .join(' + ');

    const id = `ins-${randomUUID()}`;
    db.prepare(
      `INSERT INTO insight_runs (id,device_id,description,status,created_at,created_by)
       VALUES (?,?,?,?,?,?)`,
    ).run(
      id,
      device.id,
      description.trim().slice(0, 2000),
      'completed',
      new Date().toISOString(),
      request.auth?.email ?? 'console',
    );

    return {
      id,
      status: 'completed',
      device: {
        id: device.id,
        name: device.name,
        user: device.user,
        os: device.os,
        dexScore: device.dexScore,
      },
      rootCause: { summary, confidencePct: confidence },
      checks: evaluated.map((e) => ({
        name: e.check.name,
        result: e.finding
          ? e.severity === 'critical' || e.severity === 'high'
            ? 'fail'
            : 'warn'
          : 'pass',
        severity: e.severity ?? CLEAN,
        detail: e.check.detailOf(device),
      })),
      // Only a finding gets an action, and only a check that has one.
      recommendations: findings
        .filter((f) => f.check.action)
        .slice(0, 4)
        .map((f) => ({
          id: f.check.action?.id ?? f.check.name,
          title: f.check.action?.title ?? f.check.name,
          expected: f.check.action?.expected(device) ?? '',
          risk: f.severity === 'critical' ? 'medium' : 'low',
        })),
    };
  });

  app.get(`${basePath}/insight/templates`, async () =>
    db
      .prepare(`SELECT id, name, description FROM insight_templates ORDER BY created_at DESC`)
      .all(),
  );

  app.post(`${basePath}/insight/templates`, async (request, reply) => {
    const { name, description } = request.body as { name: string; description: string };
    if (!name?.trim() || !description?.trim())
      throw badRequest('A template needs a name and a description.');

    const id = `itpl-${randomUUID()}`;
    db.prepare(
      `INSERT INTO insight_templates (id,name,description,owner,created_at) VALUES (?,?,?,?,?)`,
    ).run(
      id,
      name.trim().slice(0, 80),
      description.trim().slice(0, 2000),
      request.auth?.email ?? 'console',
      new Date().toISOString(),
    );
    return reply.code(201).send({ id, name: name.trim(), description: description.trim() });
  });

  /**
   * Remediation is a job, as every other action in this console is. The run
   * is marked remediated so the page can say what state it is in; whether the
   * fix worked is the job's business, not this endpoint's.
   */
  app.post(`${basePath}/insight/diagnostics/:runId/remediation`, async (request, reply) => {
    const { runId } = request.params as { runId: string };
    const run = db.prepare(`SELECT id FROM insight_runs WHERE id = ?`).get(runId);
    if (!run) throw notFound();

    db.prepare(`UPDATE insight_runs SET status = 'remediated' WHERE id = ?`).run(runId);

    return reply.code(202).send({
      id: `job-${randomUUID()}`,
      status: 'queued',
      createdAt: new Date().toISOString(),
      finishedAt: null,
    });
  });
}
