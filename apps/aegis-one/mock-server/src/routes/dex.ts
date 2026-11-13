import type { FastifyInstance } from 'fastify';
import type { Db } from '@aegis/mock-core';
import { DEX_BAND_SQL } from '../seed/seed';

/**
 * Digital employee experience: the score, how it is made up, what is dragging
 * it down, and the endpoints at the bottom of it.
 *
 * Every figure comes from the same three measures — processor load, memory
 * pressure and boot time — plus free disk. The score is stored, because the
 * estate is ranked by it, but it is derived from those measures at seed time
 * rather than invented, so the breakdown and the per-endpoint penalties
 * always add up to the score above them. See decision D-042.
 */

/** The thresholds the reference's own scoring table publishes. */
const METHOD: readonly (readonly [string, string, number])[] = [
  ['Starting Score', 'Every endpoint', 100],
  ['CPU', '75% or more', -10],
  ['CPU', '90% or more', -20],
  ['Memory', '75% or more', -10],
  ['Memory', '90% or more', -20],
  ['Boot Time', '60 s or more', -10],
  ['Boot Time', '90 s or more', -20],
  ['Free Disk', '10% or less', -10],
  ['Warning Band', 'Score capped at', 80],
  ['Poor Band', 'Score capped at', 55],
];

/**
 * The four issues the reference lists, each with the predicate behind it. The
 * label carries its own threshold, because a count of "slow boots" means
 * nothing without one.
 */
const ISSUES: readonly (readonly [string, string])[] = [
  ['Slow boot (60 s+)', 'boot_seconds >= 60'],
  ['High CPU (75%+)', 'cpu_pct >= 75'],
  ['Memory pressure (75%+)', 'memory_pct >= 75'],
  ['Low disk (10% or less)', 'disk_free_pct <= 10'],
];

interface DexRow extends Record<string, unknown> {
  deviceId: string;
  name: string;
  score: number;
  bootSeconds: number;
  cpuPct: number;
  memoryPct: number;
  diskFreePct: number;
  band: string;
}

/**
 * What this endpoint's score lost and why.
 *
 * Derived here from the same thresholds the score was computed with, so the
 * panel's arithmetic and the figure it explains cannot drift apart. The caps
 * are not listed as penalties: they are a ceiling, not a deduction, which is
 * why a capped score can be lower than 100 minus the penalties shown.
 */
function penaltiesOf(row: DexRow): { reason: string; points: number }[] {
  const out: { reason: string; points: number }[] = [];
  if (row.cpuPct >= 90) out.push({ reason: `CPU at ${row.cpuPct}%`, points: 20 });
  else if (row.cpuPct >= 75) out.push({ reason: `CPU at ${row.cpuPct}%`, points: 10 });
  if (row.memoryPct >= 90) out.push({ reason: `Memory at ${row.memoryPct}%`, points: 20 });
  else if (row.memoryPct >= 75) out.push({ reason: `Memory at ${row.memoryPct}%`, points: 10 });
  if (row.bootSeconds >= 90) out.push({ reason: `Boot takes ${row.bootSeconds} s`, points: 20 });
  else if (row.bootSeconds >= 60)
    out.push({ reason: `Boot takes ${row.bootSeconds} s`, points: 10 });
  if (row.diskFreePct <= 10) out.push({ reason: `Only ${row.diskFreePct}% disk free`, points: 10 });
  return out;
}

const DEX_FIELDS = `id AS deviceId, hostname AS name, dex_score AS score,
                    boot_seconds AS bootSeconds, cpu_pct AS cpuPct,
                    memory_pct AS memoryPct, disk_free_pct AS diskFreePct,
                    os_name AS os, zone_name AS site`;

export function registerDexRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  app.get(`${basePath}/dex/summary`, async () => {
    const totals = db
      .prepare(
        `SELECT CAST(ROUND(AVG(dex_score)) AS INTEGER) AS score, COUNT(*) AS total,
                SUM(${DEX_BAND_SQL} = 'good') AS good,
                SUM(${DEX_BAND_SQL} = 'warning') AS warning,
                SUM(${DEX_BAND_SQL} = 'poor') AS poor,
                AVG(cpu_pct) AS avgCpu, AVG(memory_pct) AS avgMemory,
                AVG(MAX(0, 100 - MAX(0, boot_seconds - 20))) AS bootScore,
                AVG(MIN(100, disk_free_pct * 3)) AS diskScore
           FROM devices`,
      )
      .get() as Record<string, number | null>;

    const n = (key: string): number => Number(totals[key] ?? 0);

    // The reference's own four measures, each already a 0-100 figure: boot and
    // disk are scored directly, processor and memory are inverted — a busy
    // endpoint scores low.
    const breakdown = [
      { measure: 'Boot', score: Math.round(n('bootScore')) },
      { measure: 'CPU', score: Math.round(100 - n('avgCpu') * 0.6) },
      { measure: 'Memory', score: Math.round(100 - n('avgMemory') * 0.6) },
      { measure: 'Disk', score: Math.round(n('diskScore')) },
    ];

    const topIssues = ISSUES.map(([issue, predicate]) => ({
      issue,
      endpoints: Number(
        (
          db.prepare(`SELECT COUNT(*) AS n FROM devices WHERE ${predicate}`).get() as {
            n: number;
          }
        ).n,
      ),
    }));

    return {
      score: n('score'),
      distribution: { good: n('good'), warning: n('warning'), poor: n('poor') },
      breakdown,
      topIssues,
      method: METHOD.map(([measure, threshold, points]) => ({ measure, threshold, points })),
    };
  });

  /**
   * Endpoints ranked by experience score, worst first — which is the order the
   * reference opens the table in, and the only order in which the table is
   * worth reading.
   */
  app.get(`${basePath}/dex/devices`, async (request) => {
    const query = request.query as { cursor?: string; limit?: string; sort?: string };
    const limit = Math.min(Math.max(Number(query.limit) || 10, 1), 200);
    const offset = Number.parseInt(query.cursor ?? '0', 10) || 0;

    // The contract allows a sort; the page offers the four measures behind the
    // score and nothing else, so anything unrecognised falls back to the score.
    const SORTS: Readonly<Record<string, string>> = {
      score: 'dex_score',
      boot: 'boot_seconds DESC',
      cpu: 'cpu_pct DESC',
      memory: 'memory_pct DESC',
      disk: 'disk_free_pct',
    };
    const order = SORTS[query.sort ?? 'score'] ?? 'dex_score';

    const rows = db
      .prepare(
        `SELECT ${DEX_FIELDS}, ${DEX_BAND_SQL.replace(/\b(cpu_pct|memory_pct|boot_seconds)\b/g, 'd.$1')} AS band
           FROM devices d ORDER BY ${order}, d.hostname LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as DexRow[];

    const total = Number(
      (db.prepare(`SELECT COUNT(*) AS n FROM devices`).get() as { n: number }).n,
    );

    return {
      items: rows.map((row) => ({ ...row, penalties: penaltiesOf(row) })),
      page: {
        nextCursor: offset + rows.length < total ? String(offset + rows.length) : null,
        total,
      },
    };
  });
}
