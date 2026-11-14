import { Bars, Columns, Donut, NAVY_RAMP, Rings, type Datum, type RingDatum } from './Figures';
import type { WidgetData, WidgetDefinition } from '../../api/types';

/**
 * One custom widget's chart.
 *
 * The wizard's live preview and the widget on the Overview render through
 * this same component, against the same endpoint. The reference labels its
 * preview "LIVE PREVIEW · SAME AS ON OVERVIEW"; sharing the renderer is what
 * makes that true rather than a caption.
 */

const num = (n: number): string => n.toLocaleString('en-IN');

/** A measure that is already a percentage prints one; a count does not. */
function suffixFor(definition: WidgetDefinition): string {
  const agg = definition.measure.agg;
  if (agg === 'pct') return '%';
  if (agg === 'count') return '';
  return definition.measure.field?.toLowerCase().includes('pct') ? '%' : '';
}

export function WidgetChart({
  title,
  definition,
  data,
  onPick,
}: {
  /*
   * The name lives on the layout's widget rather than inside the definition,
   * because the contract's CustomWidgetDefinition has no room for it and
   * refuses a property it did not declare.
   */
  title: string;
  definition: WidgetDefinition;
  data: WidgetData;
  onPick?: (key: string) => void;
}) {
  const view = definition.views[0];
  const chart = view?.chart ?? 'column';
  const suffix = suffixFor(definition);

  // The reference's categorical ramp, repeated round the series. Severity and
  // status keep their own colours elsewhere; a custom widget groups by
  // anything at all, so there is no meaning to colour by.
  const datum: Datum[] = data.series.map((s, i) => ({
    key: s.key,
    label: s.label,
    value: s.value,
    tone: NAVY_RAMP[i % NAVY_RAMP.length] ?? 'info',
    ...(suffix === '' ? { display: num(s.value) } : {}),
  }));

  const caption = `${title} — ${num(data.matched)} of ${num(data.total)} ${data.unit}`;

  // No group-by is the reference's "None (KPI number)": the figure itself,
  // with nothing to compare it against.
  if (!view?.groupBy) {
    const only = data.series[0];
    return (
      <Donut
        caption={caption}
        data={datum}
        centreValue={num(only?.value ?? 0)}
        centreLabel={data.unit}
        stack
        share={false}
      />
    );
  }

  const max = Math.max(1, ...datum.map((d) => d.value));

  if (chart === 'donut' || chart === 'pie') {
    return (
      <Donut
        caption={caption}
        data={datum}
        centreValue={num(data.matched)}
        centreLabel={data.unit}
        pie={chart === 'pie'}
        stack
        {...(onPick ? { onPick } : {})}
      />
    );
  }

  if (chart === 'bar') {
    return (
      <Bars
        caption={caption}
        data={datum}
        max={max}
        suffix={suffix}
        axis
        {...(onPick ? { onPick } : {})}
      />
    );
  }

  if (chart === 'rings') {
    // Rings read as a percentage of a whole, so they only carry a figure the
    // reader can place when the measure is one.
    const rings: RingDatum[] = datum.map((d) => ({
      ...d,
      sub: `${num(d.value)}${suffix}`,
      pill: `${Math.round((d.value / max) * 100)}%`,
      pillTone: d.tone,
    }));
    return <Rings caption={caption} data={rings} {...(onPick ? { onPick } : {})} />;
  }

  return (
    <Columns
      caption={caption}
      data={datum}
      max={max}
      suffix={suffix}
      axis
      {...(onPick ? { onPick } : {})}
    />
  );
}
