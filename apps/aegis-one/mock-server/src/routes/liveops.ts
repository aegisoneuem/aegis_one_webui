import type { FastifyInstance } from 'fastify';
import { notFound, type Db } from '@aegis/mock-core';

/**
 * Live Activity, for the three endpoints the generic resource lister cannot
 * serve: a single job (no page envelope), the schedules (a bare array), and
 * the one row of storage and mail settings.
 *
 * The list of jobs, the collected bundles and the audit trail are all pages
 * of rows, so they stay on the lister.
 */

/** Exactly the fields the contract's LiveJob declares, flat as the table keeps them. */
const JOB_FIELDS = `id, title, kind, status, target_count AS targetCount,
                    script_language AS scriptLanguage, change_ref AS changeRef,
                    submitted_at AS submittedAt, submitted_by AS submittedBy,
                    queued, running, succeeded, failed,
                    timed_out AS timedOut, offline, cancelled`;

interface JobRow extends Record<string, unknown> {
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  offline: number;
  cancelled: number;
}

function toJob(row: JobRow): Record<string, unknown> {
  const { queued, running, succeeded, failed, timedOut, offline, cancelled, ...rest } = row;
  return { ...rest, counts: { queued, running, succeeded, failed, timedOut, offline, cancelled } };
}

export function registerLiveOpsRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  app.get(`${basePath}/liveops/script-jobs/:jobId`, async (request) => {
    const { jobId } = request.params as { jobId: string };
    const row = db.prepare(`SELECT ${JOB_FIELDS} FROM live_jobs WHERE id = ?`).get(jobId) as
      JobRow | undefined;
    if (!row) throw notFound();
    return toJob(row);
  });

  app.get(`${basePath}/liveops/log-schedules`, async () => {
    const rows = db
      .prepare(
        `SELECT id, name, sources, targets, cadence, runs, delivery,
                next_run_at AS nextRunAt, last_run_at AS lastRunAt, enabled
           FROM log_schedules ORDER BY next_run_at`,
      )
      .all() as Record<string, unknown>[];

    return rows.map((row) => ({
      ...row,
      sources: JSON.parse(String(row['sources'])) as unknown,
      targets: JSON.parse(String(row['targets'])) as unknown,
      enabled: row['enabled'] === 1,
    }));
  });

  app.get(`${basePath}/liveops/log-settings`, async () => {
    const row = db
      .prepare(
        `SELECT retention_days AS retentionDays, email_bundles AS emailBundles, recipients,
                root_path AS rootPath, folder_layout AS folderLayout,
                file_name_pattern AS fileNamePattern, max_bundle_size_mb AS maxBundleSizeMb,
                send_as AS sendAs, attachment_limit_mb AS attachmentLimitMb
           FROM log_settings WHERE id = 1`,
      )
      .get() as Record<string, unknown> | undefined;
    if (!row) throw notFound();

    return {
      ...row,
      emailBundles: row['emailBundles'] === 1,
      recipients: String(row['recipients'] ?? '')
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean),
    };
  });
}
