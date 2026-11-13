/**
 * The four chart forms the approved Overview uses: a donut, a ring, a column
 * chart and a horizontal bar chart.
 *
 * They are drawn here rather than taken from a charting library because the
 * reference draws them as plain geometry — no axes furniture, no tooltips
 * layer, no animation — and because every one of them has to be colourable per
 * slice from the same `Series` the panel already has. Each renders a
 * visually-hidden table alongside so the figures are readable without sight.
 */
import { useId } from 'react';
import styles from './Figures.module.css';

/**
 * The tone names the approved status palette defines.
 *
 * `sand` and `amber` are the two lighter steps of the warm ramp. They exist
 * because a severity or age ramp needs four warm steps, and good/warn/bad
 * only gives it two. `deep` is the darkest navy step, for a figure the
 * reference draws in the navy the page's own headings use, and `teal` is the
 * reference's own fourth chart colour, which the DEX score breakdown needs to
 * tell four measures apart.
 *
 * `deep`, `info`, `mid`, `alt` and `pale` are the five navy steps in order —
 * see `NAVY_RAMP`.
 */
export type Tone =
  | 'good'
  | 'warn'
  | 'bad'
  | 'info'
  | 'alt'
  | 'neutral'
  | 'sand'
  | 'amber'
  | 'deep'
  | 'mid'
  | 'pale'
  | 'teal';

/**
 * The five navy steps in the order v129 walks them, for a chart whose
 * categories are shares rather than outcomes. A categorical chart takes this
 * and repeats from the start once it runs out, exactly as the reference does
 * on a nine-bar breakdown.
 */
export const NAVY_RAMP: readonly Tone[] = ['deep', 'info', 'mid', 'alt', 'pale'];

export type Datum = {
  key: string;
  label: string;
  value: number;
  tone: Tone;
  /** Shown under the label on a column chart, e.g. "weight 30%". */
  note?: string;
  /**
   * What to print above the bar, when the raw value does not read well — a
   * count in the thousands wants its separators.
   */
  display?: string;
};

export type Series = {
  /** Describes the unit, for the hidden table's caption. */
  caption: string;
  data: Datum[];
};

const TONE_CLASS: Record<Tone, string> = {
  good: styles.good as string,
  warn: styles.warn as string,
  bad: styles.bad as string,
  info: styles.info as string,
  alt: styles.alt as string,
  neutral: styles.neutral as string,
  sand: styles.sand as string,
  amber: styles.amber as string,
  deep: styles.deep as string,
  mid: styles.mid as string,
  pale: styles.pale as string,
  teal: styles.teal as string,
};

/** High is good: the band the approved design colours a percentage by. */
export const bandTone = (pctValue: number): Tone =>
  pctValue >= 85 ? 'good' : pctValue >= 70 ? 'warn' : 'bad';

function DataTable({ caption, data, unit }: Series & { unit: string }) {
  return (
    <table className={styles.srOnly}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">{unit}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.key}>
            <th scope="row">{d.label}</th>
            <td>{d.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * The tick values a value axis shows, matching the reference's own choice.
 *
 * v129 draws five ticks and never a fractional one, so the step is the
 * smallest whole, round number that lets four of them cover the tallest bar:
 * a nine-bar maximum gets 0·3·6·9·12 and an eight gets 0·2·4·6·8, which is
 * exactly what the reference's Operating systems and Computers by location
 * panels show.
 */
export function axisTicks(max: number, count = 5): number[] {
  const raw = Math.max(max, 1) / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  let step = magnitude * 10;
  for (const multiple of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const candidate = multiple * magnitude;
    if (candidate >= raw) {
      step = candidate;
      break;
    }
  }
  step = Math.max(1, Math.round(step));
  return Array.from({ length: count }, (_, i) => i * step);
}

type FigureProps = Series & {
  /** Clicking a slice, bar or ring opens the matching detail. */
  onPick?: (key: string) => void;
};

/**
 * A donut, or — with `pie` — the same geometry with no hole. Slices are drawn
 * as stroked arcs on one circle, which keeps them a single path each and means
 * a slice can be a button without nesting interactive SVG.
 */
export function Donut({
  caption,
  data,
  onPick,
  centreValue,
  centreLabel,
  pie = false,
  stack = false,
  share = true,
}: FigureProps & {
  centreValue: string;
  centreLabel: string;
  pie?: boolean;
  /** Puts the legend under the ring, for a panel one column wide. */
  stack?: boolean;
  /**
   * The share column in the legend. The Overview's compliance ring shows it
   * ("Compliant 19 59%"); a report's donut does not, and prints the count
   * alone against the right edge.
   */
  share?: boolean;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  /*
   * A pie is the same arcs with a stroke wide enough to close the hole: the
   * stroke straddles the radius, so r + width/2 has to land exactly on the
   * viewBox's own radius of 30 or the circle is clipped into a square.
   */
  const r = pie ? 15 : 20;
  const circumference = 2 * Math.PI * r;
  const width = pie ? 30 : 10;

  // Each arc starts where the previous one ended, so the offsets are a running
  // total rather than a counter mutated while mapping.
  const arcs = data.reduce<(Datum & { share: number; dash: number; offset: number })[]>(
    (acc, d) => {
      const share = total ? d.value / total : 0;
      const prev = acc[acc.length - 1];
      const offset = prev ? prev.offset + prev.dash : 0;
      acc.push({ ...d, share, dash: share * circumference, offset });
      return acc;
    },
    [],
  );

  return (
    <div
      className={[styles.donutWrap, stack ? styles.donutStack : '', share ? '' : styles.noShare]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.donutFig}>
        <svg viewBox="0 0 60 60" className={styles.donutSvg} role="presentation">
          <circle className={styles.track} cx="30" cy="30" r={r} strokeWidth={width} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              className={`${styles.arc} ${TONE_CLASS[a.tone]}`}
              cx="30"
              cy="30"
              r={r}
              strokeWidth={width}
              strokeDasharray={`${a.dash} ${circumference - a.dash}`}
              strokeDashoffset={-a.offset}
            />
          ))}
        </svg>
        {pie ? null : (
          <span className={styles.donutCentre}>
            <strong>{centreValue}</strong>
            <small>{centreLabel}</small>
          </span>
        )}
      </div>

      <ul className={styles.legend}>
        {arcs.map((a) => (
          <li key={a.key}>
            <button
              type="button"
              className={styles.legendRow}
              onClick={onPick ? () => onPick(a.key) : undefined}
              disabled={!onPick}
            >
              <i className={`${styles.swatch} ${TONE_CLASS[a.tone]}`} aria-hidden="true" />
              <span className={styles.legendLabel}>{a.label}</span>
              <span className={styles.legendValue}>{a.value.toLocaleString('en-IN')}</span>
              {share ? (
                <span className={styles.legendPct}>{Math.round(a.share * 100)}%</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>

      <DataTable caption={caption} data={data} unit="Count" />
    </div>
  );
}

/**
 * Vertical columns scaled to 100, with an optional dashed target line — the
 * form the reference uses for the health measures.
 */
export function Columns({
  caption,
  data,
  onPick,
  target,
  max = 100,
  suffix = '%',
  axis = false,
}: FigureProps & {
  target?: number;
  max?: number;
  suffix?: string;
  /**
   * Draws the value axis the reference's report charts have: gridlines, tick
   * labels down the left and a ceiling rounded up to the top tick.
   *
   * Off by default, because the Overview's health-score columns carry their
   * own percentage above each bar and v129 gives them no axis at all.
   */
  axis?: boolean;
}) {
  const targetId = useId();
  const ticks = axis ? axisTicks(Math.max(1, ...data.map((d) => d.value))) : [];
  // With an axis, the plot has to reach the top tick rather than the tallest
  // bar, or a bar would sit above its own gridline.
  const ceiling = (axis ? ticks[ticks.length - 1] : max) || 1;
  return (
    <div className={axis ? `${styles.columns} ${styles.hasAxis}` : styles.columns}>
      <div className={styles.plot}>
        {/*
         * The ticks are always five evenly spaced values, because the step
         * is chosen so that four of them reach the ceiling. That is what
         * lets the labels and their rules be laid out with space-between
         * rather than positioned from a computed percentage.
         */}
        {axis ? (
          <>
            <div className={styles.valueAxis} aria-hidden="true">
              {[...ticks].reverse().map((t) => (
                <span key={t}>{t.toLocaleString('en-IN')}</span>
              ))}
            </div>
            <div className={styles.gridlines} aria-hidden="true">
              {ticks.map((t) => (
                <span key={t} />
              ))}
            </div>
          </>
        ) : null}
        {/*
         * The bar geometry lives in SVG rather than in a style attribute: a
         * 0–100 viewBox stretched to the box means the height is a data
         * value, and the stylesheet keeps sole say over the pixels.
         */}
        {target === undefined ? null : (
          <svg
            className={styles.target}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-labelledby={targetId}
          >
            <line
              x1="0"
              x2="100"
              y1={100 - (target / ceiling) * 100}
              y2={100 - (target / ceiling) * 100}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        {data.map((d) => {
          const height = Math.max(1, (d.value / ceiling) * 100);
          return (
            <div key={d.key} className={styles.column}>
              <span className={styles.columnValue}>{d.display ?? `${d.value}${suffix}`}</span>
              <button
                type="button"
                className={`${styles.columnBar} ${TONE_CLASS[d.tone]}`}
                onClick={onPick ? () => onPick(d.key) : undefined}
                disabled={!onPick}
                aria-label={`${d.label}: ${d.value}${suffix}`}
              >
                <svg viewBox="0 0 1 100" preserveAspectRatio="none">
                  <rect x="0" width="1" y={100 - height} height={height} />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      <div className={styles.axis}>
        {data.map((d) => (
          <span key={d.key} className={styles.axisTick}>
            <b title={d.label}>{d.label}</b>
            {d.note ? <small>{d.note}</small> : null}
          </span>
        ))}
      </div>
      {target === undefined ? null : (
        <span id={targetId} className={styles.srOnly}>
          Target {target}
          {suffix}
        </span>
      )}
      <DataTable caption={caption} data={data} unit={suffix === '%' ? 'Percent' : 'Value'} />
    </div>
  );
}

/** The same series laid on its side, which reads better with long labels. */
export function Bars({
  caption,
  data,
  onPick,
  max = 100,
  suffix = '%',
  axis = false,
}: FigureProps & {
  max?: number;
  suffix?: string;
  /** The value axis along the bottom, as the reference's Bar charts have. */
  axis?: boolean;
}) {
  const ticks = axis ? axisTicks(Math.max(1, ...data.map((d) => d.value))) : [];
  const ceiling =
    (axis ? ticks[ticks.length - 1] : Math.max(max, ...data.map((d) => d.value))) || 1;
  return (
    <div className={axis ? `${styles.bars} ${styles.hasAxis}` : styles.bars}>
      {data.map((d) => (
        <div key={d.key} className={styles.barRow}>
          <span className={styles.barLabel}>{d.label}</span>
          <span className={styles.barTrack}>
            <button
              type="button"
              className={`${styles.bar} ${TONE_CLASS[d.tone]}`}
              onClick={onPick ? () => onPick(d.key) : undefined}
              disabled={!onPick}
              aria-label={`${d.label}: ${d.value}${suffix}`}
            >
              <svg viewBox="0 0 100 1" preserveAspectRatio="none">
                <rect x="0" y="0" height="1" width={Math.max(1, (d.value / ceiling) * 100)} />
              </svg>
            </button>
          </span>
          <span className={styles.barValue}>
            {d.display ?? `${d.value.toLocaleString('en-IN')}${suffix}`}
          </span>
        </div>
      ))}
      {axis ? (
        <div className={styles.barAxis} aria-hidden="true">
          <span />
          <span className={styles.barAxisScale}>
            {ticks.map((t) => (
              <b key={t}>{t.toLocaleString('en-IN')}</b>
            ))}
          </span>
          <span />
        </div>
      ) : null}
      <DataTable caption={caption} data={data} unit={suffix === '%' ? 'Percent' : 'Value'} />
    </div>
  );
}

export type RingDatum = Datum & { sub: string; pill: string; pillTone: Tone };

/** One ring per control, with its count and distance to target beneath. */
export function Rings({
  caption,
  data,
  onPick,
}: { caption: string; data: RingDatum[] } & Pick<FigureProps, 'onPick'>) {
  const r = 22;
  const circumference = 2 * Math.PI * r;
  return (
    <div className={styles.rings}>
      {data.map((d) => (
        <button
          key={d.key}
          type="button"
          className={styles.ring}
          onClick={onPick ? () => onPick(d.key) : undefined}
          disabled={!onPick}
        >
          <span className={styles.ringFig}>
            <svg viewBox="0 0 56 56" role="presentation">
              <circle className={styles.track} cx="28" cy="28" r={r} strokeWidth="7" />
              <circle
                className={`${styles.arc} ${TONE_CLASS[d.tone]}`}
                cx="28"
                cy="28"
                r={r}
                strokeWidth="7"
                strokeDasharray={`${(d.value / 100) * circumference} ${circumference}`}
                strokeDashoffset={0}
              />
            </svg>
            <em>{d.value}%</em>
          </span>
          <strong>{d.label}</strong>
          <small>{d.sub}</small>
          <span className={`${styles.pill} ${TONE_CLASS[d.pillTone]}`}>{d.pill}</span>
        </button>
      ))}
      <DataTable caption={caption} data={data} unit="Percent protected" />
    </div>
  );
}
