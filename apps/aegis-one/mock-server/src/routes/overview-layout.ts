import type { FastifyInstance } from 'fastify';
import { badRequest, type Db } from '@aegis/mock-core';

/**
 * The Overview's saved layout.
 *
 * `GET` and `PUT /overview/layout` have been in the contract from the start
 * with nothing behind them, which is the same failure `/audit`, `?group=`,
 * `?filter=` and `/groups/import` had: the console could save a layout, be
 * told it worked, and find the old one on the next load.
 *
 * The layout is stored as the JSON the contract declares rather than shredded
 * into columns. Nothing queries inside it, and a table mirroring
 * `OverviewLayout` would need migrating every time the schema gains a field.
 */

/** The widgets this console's Overview actually draws, in their drawn order. */
export const WIDGET_IDS = [
  'key-metrics',
  'health',
  'patch-compliance',
  'security-posture',
  'deployment-status',
  'expiring-soon',
  'needs-attention',
  'recent-activity',
] as const;

type WidgetId = (typeof WIDGET_IDS)[number];

const CHART_TYPES = new Set(['donut', 'pie', 'column', 'bar', 'rings']);

/** The four the reference offers under "Start From a Layout". */
export const PRESETS = ['Default', 'Security Focus', 'Patch Focus', 'Executive Summary'] as const;

export interface LayoutWidget {
  id: string;
  type: string;
  visible: boolean;
  chartType?: string;
  view?: string;
  title?: string;
}

export interface Layout {
  preset: string;
  widgets: LayoutWidget[];
  thresholds?: { healthy: number; atRisk: number; complianceTarget: number };
}

export const DEFAULT_THRESHOLDS = { healthy: 85, atRisk: 70, complianceTarget: 95 };

export function defaultLayout(): Layout {
  return {
    preset: 'Default',
    widgets: WIDGET_IDS.map((id) => ({ id, type: id, visible: true })),
    thresholds: { ...DEFAULT_THRESHOLDS },
  };
}

/**
 * Validation the contract cannot express on its own.
 *
 * Ajv already refuses an unknown property, an over-long string and a chart
 * type outside the enum. What it cannot say is that a layout must name
 * widgets this Overview has, must not name one twice, and must keep At risk
 * below Healthy — a band that starts above the one above it is not a band.
 */
function validate(body: unknown): Layout {
  if (!body || typeof body !== 'object') throw badRequest('A layout object is required.');
  const raw = body as Record<string, unknown>;

  const preset = typeof raw['preset'] === 'string' ? raw['preset'] : '';
  if (!preset) throw badRequest('preset is required.');

  if (!Array.isArray(raw['widgets'])) throw badRequest('widgets must be an array.');
  const seen = new Set<string>();
  const widgets: LayoutWidget[] = [];

  for (const entry of raw['widgets'] as unknown[]) {
    if (!entry || typeof entry !== 'object') throw badRequest('Each widget must be an object.');
    const w = entry as Record<string, unknown>;
    const id = typeof w['id'] === 'string' ? w['id'] : '';
    if (!id) throw badRequest('Each widget needs an id.');
    if (!WIDGET_IDS.includes(id as WidgetId)) {
      throw badRequest(`This Overview has no widget called "${id}".`);
    }
    if (seen.has(id)) throw badRequest(`Widget "${id}" is listed twice.`);
    seen.add(id);

    const chartType = typeof w['chartType'] === 'string' ? w['chartType'] : undefined;
    if (chartType !== undefined && !CHART_TYPES.has(chartType)) {
      throw badRequest(`"${chartType}" is not a chart type.`);
    }

    widgets.push({
      id,
      type: typeof w['type'] === 'string' ? w['type'] : id,
      visible: w['visible'] !== false,
      ...(chartType ? { chartType } : {}),
      ...(typeof w['view'] === 'string' ? { view: w['view'] } : {}),
      ...(typeof w['title'] === 'string' ? { title: w['title'] } : {}),
    });
  }

  if (widgets.length === 0) throw badRequest('A layout needs at least one widget.');

  let thresholds: Layout['thresholds'];
  if (raw['thresholds'] !== undefined) {
    const t = raw['thresholds'] as Record<string, unknown>;
    const healthy = Number(t['healthy']);
    const atRisk = Number(t['atRisk']);
    const complianceTarget = Number(t['complianceTarget']);
    for (const [name, value] of [
      ['healthy', healthy],
      ['atRisk', atRisk],
      ['complianceTarget', complianceTarget],
    ] as const) {
      if (!Number.isInteger(value)) throw badRequest(`thresholds.${name} must be a whole number.`);
    }
    if (atRisk >= healthy) {
      throw badRequest('At risk must be below Healthy, or there is no Fair band between them.');
    }
    thresholds = { healthy, atRisk, complianceTarget };
  }

  return { preset, widgets, ...(thresholds ? { thresholds } : {}) };
}

export function registerOverviewLayoutRoutes(app: FastifyInstance, db: Db, basePath: string): void {
  const read = db.prepare(`SELECT layout FROM overview_layout WHERE user_id = ?`);
  const write = db.prepare(
    `INSERT INTO overview_layout (user_id, layout, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`,
  );

  app.get(`${basePath}/overview/layout`, async (request) => {
    const userId = request.auth?.sub;
    if (!userId) return defaultLayout();
    const row = read.get(userId) as { layout: string } | undefined;
    if (!row) return defaultLayout();
    try {
      return JSON.parse(row.layout) as Layout;
    } catch {
      // A row that will not parse is a row written by something that is not
      // this server. The default is a better answer than a 500.
      return defaultLayout();
    }
  });

  app.put(`${basePath}/overview/layout`, async (request) => {
    const layout = validate(request.body);
    const userId = request.auth?.sub;
    if (userId) write.run(userId, JSON.stringify(layout), new Date().toISOString());
    return layout;
  });
}
