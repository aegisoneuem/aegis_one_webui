import { useState } from 'react';
import { Button, Checkbox, Modal } from '@aegis/ui';
import type { OverviewLayout, OverviewThresholds } from '../api/types';
import styles from './OverviewCustomize.module.css';

/**
 * Customize Overview — the dialog behind the header's Customize and the
 * health tile's Thresholds.
 *
 * It edits a draft and hands the whole layout back on Done, rather than
 * saving on every keystroke: a half-typed threshold is not a layout anyone
 * meant to keep, and the reference's own dialog ends with a Done.
 *
 * Three of the reference's four sections are here. "Preview As Role" is not:
 * it asks the API to answer as somebody else, and the contract has no way to
 * say that. A select that changed only a label would claim a preview this
 * console cannot give.
 */

export const WIDGET_TITLES: Record<string, string> = {
  'key-metrics': 'Key Metrics',
  health: 'Overall Health Score',
  'patch-compliance': 'Patch Compliance',
  'security-posture': 'Security Posture',
  'deployment-status': 'Deployment Status',
  'expiring-soon': 'Expiring Soon',
  'needs-attention': 'Needs Attention',
  'recent-activity': 'Recent Activity',
};

export const DEFAULT_ORDER = [
  'key-metrics',
  'health',
  'patch-compliance',
  'security-posture',
  'deployment-status',
  'expiring-soon',
  'needs-attention',
  'recent-activity',
] as const;

export const DEFAULT_THRESHOLDS: OverviewThresholds = {
  healthy: 85,
  atRisk: 70,
  complianceTarget: 95,
};

/*
 * The four layouts the reference offers, read out of the running reference
 * rather than guessed: each one sets both what is shown and the order it is
 * shown in, and everything it hides falls to the bottom keeping its default
 * relative order.
 *
 * The reference has a ninth widget, Status Checks, which is its first-run
 * setup checklist. It is off in all four of its own presets, this Overview
 * has no such panel, and `/setup/checklist` is another path the contract
 * declares with nothing behind it — so there is nothing here to hide.
 */
export const PRESETS: Record<string, readonly string[]> = {
  Default: DEFAULT_ORDER,
  'Security Focus': [
    'key-metrics',
    'security-posture',
    'needs-attention',
    'health',
    'recent-activity',
  ],
  'Patch Focus': [
    'key-metrics',
    'patch-compliance',
    'needs-attention',
    'deployment-status',
    'recent-activity',
  ],
  'Executive Summary': ['key-metrics', 'health', 'security-posture', 'deployment-status'],
};

const THRESHOLD_PRESETS: readonly [string, number, number][] = [
  ['85 / 70 (default)', 85, 70],
  ['80 / 65', 80, 65],
  ['75 / 60', 75, 60],
];

/** Applies a preset: the named widgets first and visible, the rest after and off. */
export function applyPreset(name: string): OverviewLayout['widgets'] {
  const shown = PRESETS[name] ?? DEFAULT_ORDER;
  const hidden = DEFAULT_ORDER.filter((id) => !shown.includes(id));
  return [
    ...shown.map((id) => ({ id, type: id, visible: true })),
    ...hidden.map((id) => ({ id, type: id, visible: false })),
  ];
}

export function OverviewCustomize({
  open,
  layout,
  score,
  onClose,
  onApply,
}: {
  open: boolean;
  layout: OverviewLayout;
  /** The score the readout at the bottom reports against the bands. */
  score: number;
  onClose: () => void;
  onApply: (layout: OverviewLayout) => void;
}) {
  /*
   * Seeded from what is applied, and remounted by the parent on each open, so
   * the dialog never reopens showing a draft that was cancelled.
   */
  const [draft, setDraft] = useState<OverviewLayout>(() => ({
    ...layout,
    widgets: layout.widgets.map((w) => ({ ...w })),
    thresholds: { ...(layout.thresholds ?? DEFAULT_THRESHOLDS) },
  }));

  const thresholds = draft.thresholds ?? DEFAULT_THRESHOLDS;
  const set = (changes: Partial<OverviewLayout>) => setDraft({ ...draft, ...changes });
  const setThreshold = (changes: Partial<OverviewThresholds>) =>
    set({ thresholds: { ...thresholds, ...changes } });

  const move = (index: number, by: -1 | 1) => {
    const next = [...draft.widgets];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    const moved = next[index];
    const other = next[to];
    if (!moved || !other) return;
    next[index] = other;
    next[to] = moved;
    set({ widgets: next });
  };

  const toggle = (index: number) => {
    const next = draft.widgets.map((w, i) => (i === index ? { ...w, visible: !w.visible } : w));
    set({ widgets: next });
  };

  // What the score would read as under the bands as they stand, which is the
  // only way to choose a band without applying it and looking.
  const bandName =
    score >= thresholds.healthy ? 'Healthy' : score >= thresholds.atRisk ? 'Fair' : 'At risk';
  const bandRange =
    bandName === 'Healthy'
      ? `Healthy = ${thresholds.healthy} and above`
      : bandName === 'Fair'
        ? `Fair = ${thresholds.atRisk}–${thresholds.healthy - 1}`
        : `At risk = below ${thresholds.atRisk}`;

  const bandsValid = thresholds.atRisk < thresholds.healthy;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize Overview"
      size="lg"
      footer={
        <>
          <Button
            onClick={() =>
              setDraft({
                preset: 'Default',
                widgets: applyPreset('Default'),
                thresholds: { ...DEFAULT_THRESHOLDS },
              })
            }
          >
            Reset to Default
          </Button>
          <Button variant="primary" disabled={!bandsValid} onClick={() => onApply(draft)}>
            Done
          </Button>
        </>
      }
    >
      <section className={styles.section}>
        <h3 className={styles.heading}>Start From a Layout</h3>
        <div className={styles.presets}>
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={draft.preset === name}
              className={draft.preset === name ? styles.presetOn : styles.preset}
              onClick={() => set({ preset: name, widgets: applyPreset(name) })}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Widgets</h3>
        <ul className={styles.widgets}>
          {draft.widgets.map((w, index) => {
            const title = w.title ?? WIDGET_TITLES[w.id] ?? w.id;
            return (
              <li key={w.id} className={styles.widget}>
                <Checkbox
                  checked={w.visible}
                  aria-label={`Show ${title}`}
                  onChange={() => toggle(index)}
                />
                <span className={styles.widgetName}>{title}</span>
                <button
                  type="button"
                  className={styles.move}
                  aria-label={`Move ${title} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  &#8593;
                </button>
                <button
                  type="button"
                  className={styles.move}
                  aria-label={`Move ${title} down`}
                  disabled={index === draft.widgets.length - 1}
                  onClick={() => move(index, 1)}
                >
                  &#8595;
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Colour Thresholds</h3>
        <div className={styles.presets}>
          {THRESHOLD_PRESETS.map(([label, healthy, atRisk]) => (
            <button
              key={label}
              type="button"
              aria-pressed={thresholds.healthy === healthy && thresholds.atRisk === atRisk}
              className={
                thresholds.healthy === healthy && thresholds.atRisk === atRisk
                  ? styles.presetOn
                  : styles.preset
              }
              onClick={() => setThreshold({ healthy, atRisk })}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={styles.numbers}>
          <label className={styles.number}>
            <span>Healthy (green) at or above</span>
            <input
              type="number"
              min={1}
              max={100}
              value={thresholds.healthy}
              onChange={(e) => setThreshold({ healthy: Number(e.target.value) })}
            />
            <span className={styles.unit}>%</span>
          </label>
          <label className={styles.number}>
            <span>At risk (red) below</span>
            <input
              type="number"
              min={0}
              max={99}
              value={thresholds.atRisk}
              onChange={(e) => setThreshold({ atRisk: Number(e.target.value) })}
            />
            <span className={styles.unit}>%</span>
          </label>
          <label className={styles.number}>
            <span>Compliance Target</span>
            <input
              type="number"
              min={1}
              max={100}
              value={thresholds.complianceTarget}
              onChange={(e) => setThreshold({ complianceTarget: Number(e.target.value) })}
            />
            <span className={styles.unit}>%</span>
          </label>
        </div>

        {bandsValid ? (
          <p className={styles.readout}>
            <span>Current Score</span> <b>{score}</b> <span>Shows As</span>{' '}
            <b className={styles.band}>{bandName}</b> <span>&middot; {bandRange}</span>
          </p>
        ) : (
          <p className={styles.invalid}>
            At risk must be below Healthy, or there is no Fair band between them.
          </p>
        )}
      </section>
    </Modal>
  );
}
