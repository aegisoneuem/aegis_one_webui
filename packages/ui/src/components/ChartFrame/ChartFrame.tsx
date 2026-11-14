import { forwardRef, useRef, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../cx';
import styles from './ChartFrame.module.css';

/**
 * Series colours in order. Charts read these rather than hard-coding hex, so a
 * sibling console restyles every chart by redefining --ui-series-N.
 */
export const SERIES_VARS = [
  'var(--ui-series-1)',
  'var(--ui-series-2)',
  'var(--ui-series-3)',
  'var(--ui-series-4)',
  'var(--ui-series-5)',
  'var(--ui-series-6)',
  'var(--ui-series-7)',
  'var(--ui-series-8)',
] as const;

export interface ChartLegendItem {
  id: string;
  label: string;
  color: string;
  /** Right-aligned figure, e.g. the series total. */
  value?: string;
  hidden?: boolean;
}

export interface ChartFrameProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Interactive legend. Omit it and let the chart draw its own if it must. */
  legend?: readonly ChartLegendItem[];
  onLegendToggle?: (id: string) => void;
  /** What the reader should take away, or a caveat about the data. */
  caption?: ReactNode;
  /**
   * Equivalent table for screen readers and for anyone who wants the numbers.
   * A chart with no text alternative is unreadable to some of the audience.
   */
  dataTable?: ReactNode;
  children: ReactNode;
}

export const ChartFrame = forwardRef<HTMLDivElement, ChartFrameProps>(function ChartFrame(
  {
    title,
    subtitle,
    actions,
    legend,
    onLegendToggle,
    caption,
    dataTable,
    className,
    children,
    ...rest
  },
  ref,
) {
  const plot = useRef<HTMLDivElement>(null);

  return (
    <figure ref={ref as never} className={cx(styles.frame, className)} {...rest}>
      {title || actions ? (
        <div className={styles.head}>
          <div className={styles.titles}>
            {title ? <figcaption className={styles.title}>{title}</figcaption> : null}
            {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
          </div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </div>
      ) : null}

      <div ref={plot} className={styles.plot}>
        {children}
      </div>

      {legend?.length ? (
        <div className={styles.legend}>
          {legend.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.legendItem}
              aria-pressed={!item.hidden}
              disabled={!onLegendToggle}
              onClick={() => onLegendToggle?.(item.id)}
            >
              <ChartSwatch color={item.color} />
              {item.label}
              {item.value ? <span className={styles.legendValue}>{item.value}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      {caption ? <p className={styles.caption}>{caption}</p> : null}
      {dataTable}
    </figure>
  );
});

/**
 * Colour chip for a legend row. Its colour is data, not styling, so it is set
 * on the node rather than through a class.
 */
function ChartSwatch({ color }: { color: string }) {
  return (
    <span
      className={styles.swatch}
      aria-hidden="true"
      ref={(node) => {
        if (node) node.style.background = color;
      }}
    />
  );
}
