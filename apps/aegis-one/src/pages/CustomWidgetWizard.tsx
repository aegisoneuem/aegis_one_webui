import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Modal, Select, Skeleton } from '@aegis/ui';
import { api } from '../api/client';
import type { WidgetData, WidgetDefinition, WidgetFields, WidgetFilterRule } from '../api/types';
import { WidgetChart } from './shared/WidgetChart';
import { WIDGET_TITLES } from './OverviewCustomize';
import styles from './CustomWidgetWizard.module.css';

/**
 * Create Custom Widget — the reference's six-step wizard.
 *
 * Every select on it is filled from `GET /overview/widget-fields` rather than
 * from a list typed in here, so a subject can never offer a dimension the
 * server would then refuse. The live preview posts the definition being built
 * to the same endpoint the finished widget reads, and draws it with the same
 * component, which is what makes the reference's "SAME AS ON OVERVIEW"
 * promise true.
 */

const STEPS = ['Start', 'Data', 'Measure', 'Views', 'Filters', 'Display'] as const;

const MEASURES: readonly { agg: WidgetDefinition['measure']['agg']; label: string }[] = [
  { agg: 'count', label: 'Count' },
  { agg: 'pct', label: '% of Total' },
  { agg: 'avg', label: 'Average' },
  { agg: 'sum', label: 'Total' },
  { agg: 'min', label: 'Lowest' },
  { agg: 'max', label: 'Highest' },
];

/** The four that measure a number need one to measure. */
const NEEDS_FIELD = new Set(['avg', 'sum', 'min', 'max']);

const CHARTS = [
  { value: 'donut', label: 'Donut' },
  { value: 'pie', label: 'Pie' },
  { value: 'column', label: 'Column' },
  { value: 'bar', label: 'Bar' },
  { value: 'rings', label: 'Rings (percent)' },
];

/* A numeric measure has no slices to divide, so the round charts drop away. */
const NUMERIC_CHARTS = CHARTS.filter((c) => ['column', 'bar', 'rings'].includes(c.value));

const OPERATORS = [
  { value: 'eq', label: 'is' },
  { value: 'ne', label: 'is not' },
  { value: 'in', label: 'is any of' },
  { value: 'like', label: 'contains' },
  { value: 'nlike', label: 'does not contain' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
  { value: 'empty', label: 'is empty' },
  { value: 'notEmpty', label: 'is not empty' },
];

const VALUELESS = new Set(['empty', 'notEmpty']);

const SIZES = [
  { value: 'third', label: 'One third' },
  { value: 'half', label: 'Half width' },
  { value: 'full', label: 'Full width' },
];

const SHOW = [
  { value: '0', label: 'All' },
  { value: '5', label: 'Top 5' },
  { value: '10', label: 'Top 10' },
  { value: '15', label: 'Top 15' },
];

interface Draft {
  title: string;
  definition: WidgetDefinition;
}

/**
 * The reference's ten starting points. Each is a definition rather than data,
 * so none of them needs anything from the contract.
 */
const TEMPLATES: readonly { title: string; note: string; definition: WidgetDefinition }[] = [
  {
    title: 'Unencrypted Devices by Department',
    note: 'Devices · by department · 1 filter',
    definition: {
      source: 'devices',
      measure: { agg: 'count' },
      views: [{ groupBy: 'department', chart: 'column', sort: 'value', limit: 0 }],
      filter: { match: 'all', rules: [{ field: 'encrypted', op: 'eq', value: '0' }] },
    },
  },
  {
    title: 'Average Compliance by OS',
    note: 'Devices · by operating system',
    definition: {
      source: 'devices',
      measure: { agg: 'avg', field: 'compliancePct' },
      views: [{ groupBy: 'osName', chart: 'bar', sort: 'value', limit: 10 }],
    },
  },
  {
    title: 'Offline Devices by Location',
    note: 'Devices · by location · 1 filter',
    definition: {
      source: 'devices',
      measure: { agg: 'count' },
      views: [{ groupBy: 'zoneName', chart: 'column', sort: 'value', limit: 0 }],
      filter: { match: 'all', rules: [{ field: 'status', op: 'eq', value: 'offline' }] },
    },
  },
  {
    title: 'Critical Patches Still Applicable',
    note: 'Patches · by platform · 1 filter',
    definition: {
      source: 'patches',
      measure: { agg: 'count' },
      views: [{ groupBy: 'platform', chart: 'donut', sort: 'value', limit: 0 }],
      filter: { match: 'all', rules: [{ field: 'severity', op: 'eq', value: 'critical' }] },
    },
  },
  {
    title: 'Failing Checks by Category',
    note: 'Compliance Checks · by category · 1 filter',
    definition: {
      source: 'checks',
      measure: { agg: 'count' },
      views: [{ groupBy: 'category', chart: 'bar', sort: 'value', limit: 10 }],
      filter: { match: 'all', rules: [{ field: 'failCount', op: 'gt', value: '0' }] },
    },
  },
  {
    title: 'Deployments by Status',
    note: 'Deployments · by status',
    definition: {
      source: 'deployments',
      measure: { agg: 'count' },
      views: [{ groupBy: 'status', chart: 'donut', sort: 'value', limit: 0 }],
    },
  },
  {
    title: 'Top 10 Installed Applications',
    note: 'Software Installs · by application',
    definition: {
      source: 'software-installs',
      measure: { agg: 'count' },
      views: [{ groupBy: 'title', chart: 'bar', sort: 'value', limit: 10 }],
    },
  },
  {
    title: 'Low Disk Laptops',
    note: 'Devices · by model · 2 filters',
    definition: {
      source: 'devices',
      measure: { agg: 'count' },
      views: [{ groupBy: 'model', chart: 'bar', sort: 'value', limit: 10 }],
      filter: {
        match: 'all',
        rules: [
          { field: 'kind', op: 'eq', value: 'laptop' },
          { field: 'diskFreePct', op: 'lt', value: '15' },
        ],
      },
    },
  },
  {
    title: 'Average DEX Score by Model',
    note: 'Devices · by model',
    definition: {
      source: 'devices',
      measure: { agg: 'avg', field: 'dexScore' },
      views: [{ groupBy: 'model', chart: 'bar', sort: 'value', limit: 10 }],
    },
  },
  {
    title: 'Devices With Reboot Pending',
    note: 'Devices · single number · 1 filter',
    definition: {
      source: 'devices',
      measure: { agg: 'count' },
      views: [{ chart: 'donut' }],
      filter: { match: 'all', rules: [{ field: 'rebootPending', op: 'eq', value: '1' }] },
    },
  },
];

const BLANK: Draft = {
  title: 'Untitled Widget',
  definition: {
    source: 'devices',
    measure: { agg: 'count' },
    views: [{ groupBy: 'osName', chart: 'donut', sort: 'value', limit: 0 }],
    size: 'third',
  },
};

export function CustomWidgetWizard({
  open,
  scope,
  onClose,
  onAdd,
}: {
  open: boolean;
  /** The Overview's own scope bar, which narrows the preview as it will the widget. */
  scope: { zone?: string; platform?: string; department?: string };
  onClose: () => void;
  onAdd: (title: string, definition: WidgetDefinition) => void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(BLANK);

  const fields = useQuery({
    queryKey: ['/overview/widget-fields'],
    queryFn: ({ signal }) => api.get<WidgetFields>('/overview/widget-fields', undefined, signal),
  });

  const source = fields.data?.sources.find((s) => s.id === draft.definition.source);
  const definition = draft.definition;
  const view = definition.views[0] ?? { chart: 'column' as const };
  const rules = definition.filter?.rules ?? [];

  const setDefinition = (changes: Partial<WidgetDefinition>) =>
    setDraft({ ...draft, definition: { ...definition, ...changes } });
  const setView = (changes: Partial<(typeof definition.views)[number]>) =>
    setDefinition({ views: [{ ...view, ...changes }] });
  const setRules = (next: WidgetFilterRule[]) =>
    setDefinition({ filter: { match: definition.filter?.match ?? 'all', rules: next } });

  /*
   * The preview. Keyed by the definition itself, so every change asks the
   * server again and nothing is computed twice in the browser; a failure
   * shows its message rather than an empty chart, because an empty chart and
   * a refused query look identical and mean opposite things.
   */
  const preview = useQuery({
    queryKey: ['/overview/widget-data', definition, scope],
    queryFn: () => api.post<WidgetData>('/overview/widget-data', { definition, ...scope }),
    retry: false,
  });

  const measureNeedsField = NEEDS_FIELD.has(definition.measure.agg);
  const numeric = measureNeedsField;
  const charts = numeric ? NUMERIC_CHARTS : CHARTS;

  const pickTemplate = (title: string, next: WidgetDefinition) => {
    setDraft({ title, definition: { size: 'third', ...next } });
    setStep(1);
  };

  const last = step === STEPS.length - 1;
  const canAdd = draft.title.trim().length > 0 && !preview.isError;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Custom Widget"
      description={`Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}`}
      size="lg"
      footer={
        <>
          {step > 0 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : null}
          <Button onClick={onClose}>Cancel</Button>
          {last ? (
            <Button
              variant="primary"
              disabled={!canAdd}
              onClick={() => onAdd(draft.title.trim(), definition)}
            >
              Add to Overview
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          )}
        </>
      }
    >
      <nav className={styles.steps} aria-label="Wizard steps">
        {STEPS.map((name, i) => (
          <button
            key={name}
            type="button"
            aria-current={i === step}
            className={i === step ? styles.stepOn : styles.step}
            // Walking back is free; walking forward past a step that has not
            // been answered is how a half-built definition reaches the server.
            disabled={i > step}
            onClick={() => setStep(i)}
          >
            {name}
          </button>
        ))}
      </nav>

      <div className={styles.body}>
        <div className={styles.pane}>
          {step === 0 ? (
            <>
              <h3 className={styles.heading}>Start From a Template</h3>
              <ul className={styles.templates}>
                {TEMPLATES.map((t) => (
                  <li key={t.title}>
                    <button
                      type="button"
                      className={styles.template}
                      onClick={() => pickTemplate(t.title, t.definition)}
                    >
                      <b>{t.title}</b>
                      <small>{t.note}</small>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className={styles.template}
                    onClick={() => {
                      setDraft(BLANK);
                      setStep(1);
                    }}
                  >
                    <b>Start From Blank</b>
                    <small>Devices · by operating system</small>
                  </button>
                </li>
              </ul>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <h3 className={styles.heading}>Data</h3>
              {fields.isLoading ? <Skeleton className={styles.paneSkeleton} /> : null}
              <ul className={styles.templates}>
                {(fields.data?.sources ?? []).map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-pressed={s.id === definition.source}
                      className={s.id === definition.source ? styles.sourceOn : styles.template}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          definition: {
                            ...definition,
                            source: s.id,
                            // A dimension belongs to its subject; carrying one
                            // across would ask for a column the new subject
                            // has not got.
                            measure: { agg: 'count' },
                            views: [{ ...view, groupBy: s.dimensions[0]?.id ?? '' }],
                            filter: { match: 'all', rules: [] },
                          },
                        })
                      }
                    >
                      <b>{s.label}</b>
                      <small>
                        {s.dimensions.length} fields · {s.numbers.length} numbers
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <h3 className={styles.heading}>Measure</h3>
              <div className={styles.chips}>
                {MEASURES.map((m) => (
                  <button
                    key={m.agg}
                    type="button"
                    aria-pressed={definition.measure.agg === m.agg}
                    className={definition.measure.agg === m.agg ? styles.chipOn : styles.chip}
                    onClick={() =>
                      setDefinition({
                        measure: NEEDS_FIELD.has(m.agg)
                          ? {
                              agg: m.agg,
                              field: definition.measure.field ?? source?.numbers[0]?.id,
                            }
                          : { agg: m.agg },
                        // A round chart cannot show an average, so the view
                        // follows the measure rather than being left invalid.
                        views: [
                          {
                            ...view,
                            chart: NEEDS_FIELD.has(m.agg)
                              ? view.chart === 'donut' || view.chart === 'pie'
                                ? 'column'
                                : view.chart
                              : view.chart,
                          },
                        ],
                      })
                    }
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {measureNeedsField ? (
                <div className={styles.field}>
                  <span>Of Field</span>
                  <Select
                    aria-label="Of Field"
                    value={definition.measure.field ?? ''}
                    options={(source?.numbers ?? []).map((n) => ({ value: n.id, label: n.label }))}
                    onChange={(e) =>
                      setDefinition({
                        measure: { agg: definition.measure.agg, field: e.target.value },
                      })
                    }
                  />
                </div>
              ) : null}
              {measureNeedsField && (source?.numbers.length ?? 0) === 0 ? (
                <p className={styles.note}>
                  {source?.label} carries no numbers, so it can only be counted.
                </p>
              ) : null}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h3 className={styles.heading}>Views</h3>
              <div className={styles.field}>
                <span>Group By</span>
                <Select
                  aria-label="Group By"
                  value={view.groupBy ?? ''}
                  placeholder="None (KPI number)"
                  options={(source?.dimensions ?? []).map((d) => ({
                    value: d.id,
                    label: d.label,
                  }))}
                  onChange={(e) => setView({ groupBy: e.target.value || undefined })}
                />
              </div>
              <div className={styles.field}>
                <span>Chart</span>
                <Select
                  aria-label="Chart"
                  value={view.chart}
                  options={charts}
                  onChange={(e) => setView({ chart: e.target.value as typeof view.chart })}
                />
              </div>
              <div className={styles.field}>
                <span>Sort</span>
                <Select
                  aria-label="Sort"
                  value={view.sort ?? 'value'}
                  options={[
                    { value: 'value', label: 'Highest first' },
                    { value: 'name', label: 'Name A–Z' },
                  ]}
                  onChange={(e) => setView({ sort: e.target.value as 'value' | 'name' })}
                />
              </div>
              <div className={styles.field}>
                <span>Show</span>
                <Select
                  aria-label="Show"
                  value={String(view.limit ?? 0)}
                  options={SHOW}
                  onChange={(e) => setView({ limit: Number(e.target.value) as 0 | 5 | 10 | 15 })}
                />
              </div>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={definition.hideNotSet ?? false}
                  onChange={(e) => setDefinition({ hideNotSet: e.target.checked })}
                />
                <span>Hide &ldquo;Not set&rdquo; values</span>
              </label>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <h3 className={styles.heading}>Filters</h3>
              <div className={styles.field}>
                <span>Match</span>
                <Select
                  aria-label="Match"
                  value={definition.filter?.match ?? 'all'}
                  options={[
                    { value: 'all', label: 'All Rules (AND)' },
                    { value: 'any', label: 'Any Rule (OR)' },
                  ]}
                  onChange={(e) =>
                    setDefinition({
                      filter: { match: e.target.value as 'all' | 'any', rules },
                    })
                  }
                />
              </div>

              <ul className={styles.rules}>
                {rules.map((rule, i) => (
                  <li key={i} className={styles.rule}>
                    <Select
                      aria-label={`Field for rule ${i + 1}`}
                      value={rule.field}
                      options={[...(source?.dimensions ?? []), ...(source?.numbers ?? [])].map(
                        (f) => ({ value: f.id, label: f.label }),
                      )}
                      onChange={(e) =>
                        setRules(
                          rules.map((r, j) => (j === i ? { ...r, field: e.target.value } : r)),
                        )
                      }
                    />
                    <Select
                      aria-label={`Operator for rule ${i + 1}`}
                      value={rule.op}
                      options={OPERATORS}
                      onChange={(e) =>
                        setRules(rules.map((r, j) => (j === i ? { ...r, op: e.target.value } : r)))
                      }
                    />
                    {VALUELESS.has(rule.op) ? (
                      <span className={styles.noValue}>no value</span>
                    ) : (
                      <input
                        className={styles.value}
                        aria-label={`Value for rule ${i + 1}`}
                        value={rule.value ?? ''}
                        onChange={(e) =>
                          setRules(
                            rules.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)),
                          )
                        }
                      />
                    )}
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remove rule ${i + 1}`}
                      onClick={() => setRules(rules.filter((_, j) => j !== i))}
                    >
                      &times;
                    </button>
                  </li>
                ))}
              </ul>

              <Button
                size="sm"
                disabled={rules.length >= 20}
                onClick={() =>
                  setRules([
                    ...rules,
                    { field: source?.dimensions[0]?.id ?? '', op: 'eq', value: '' },
                  ])
                }
              >
                + Add Filter
              </Button>

              {preview.data ? (
                <p className={styles.note}>
                  {preview.data.matched.toLocaleString('en-IN')} of{' '}
                  {preview.data.total.toLocaleString('en-IN')} {preview.data.unit} match ·
                  {scope.zone || scope.platform || scope.department
                    ? ' the Overview’s scope bar also applies'
                    : ' the whole estate'}
                </p>
              ) : null}
            </>
          ) : null}

          {step === 5 ? (
            <>
              <h3 className={styles.heading}>Display</h3>
              <div className={styles.field}>
                <span>Widget Name</span>
                <input
                  className={styles.value}
                  aria-label="Widget Name"
                  value={draft.title}
                  maxLength={80}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div className={styles.field}>
                <span>Size</span>
                <Select
                  aria-label="Size"
                  value={definition.size ?? 'third'}
                  options={SIZES}
                  onChange={(e) =>
                    setDefinition({ size: e.target.value as 'third' | 'half' | 'full' })
                  }
                />
              </div>
              <div className={styles.field}>
                <span>Place After</span>
                <Select
                  aria-label="Place After"
                  value={definition.placeAfter ?? ''}
                  placeholder="End of overview"
                  options={Object.entries(WIDGET_TITLES).map(([id, label]) => ({
                    value: id,
                    label,
                  }))}
                  onChange={(e) => setDefinition({ placeAfter: e.target.value || undefined })}
                />
              </div>
              <div className={styles.field}>
                <span>Target % (optional)</span>
                <input
                  className={styles.value}
                  type="number"
                  min={1}
                  max={100}
                  aria-label="Target %"
                  value={definition.targetPct ?? ''}
                  onChange={(e) =>
                    setDefinition({
                      targetPct: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>
            </>
          ) : null}
        </div>

        <aside className={styles.preview}>
          <h3 className={styles.previewHeading}>Live preview &middot; same as on Overview</h3>
          <p className={styles.previewTitle}>{draft.title || 'Untitled Widget'}</p>
          {preview.isLoading ? <Skeleton className={styles.previewSkeleton} /> : null}
          {preview.isError ? (
            <p className={styles.error}>
              {preview.error instanceof Error
                ? preview.error.message
                : 'That combination cannot be measured.'}
            </p>
          ) : null}
          {preview.data ? (
            <WidgetChart title={draft.title} definition={definition} data={preview.data} />
          ) : null}
        </aside>
      </div>
    </Modal>
  );
}
