import { forwardRef, useId, type HTMLAttributes } from 'react';
import { cx } from '../../cx';
import { Button } from '../Button/Button';
import { Select } from '../Select/Select';
import styles from './Pagination.module.css';

export interface PaginationProps extends HTMLAttributes<HTMLDivElement> {
  /** 1-based index of the first row on this page. */
  from: number;
  to: number;
  /** Omit when the server does not count the whole set. */
  total?: number;
  pageSize: number;
  onPageSizeChange?: (size: number) => void;
  /** Max 200 per page, matching the API contract. */
  pageSizes?: readonly number[];
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  /** Noun for the rows, e.g. "devices". */
  unit?: string;
}

const fmt = (n: number) => n.toLocaleString('en-IN');

/**
 * Cursor-style pager: previous and next only, because the API returns an
 * opaque cursor rather than numbered pages. Showing page numbers would mean
 * promising the client can jump to page 400, which the contract does not do.
 */
export const Pagination = forwardRef<HTMLDivElement, PaginationProps>(function Pagination(
  {
    from,
    to,
    total,
    pageSize,
    onPageSizeChange,
    pageSizes = [50, 100, 200],
    onPrevious,
    onNext,
    hasPrevious = false,
    hasNext = false,
    unit = 'rows',
    className,
    ...rest
  },
  ref,
) {
  const sizeId = useId();

  return (
    <div ref={ref} className={cx(styles.bar, className)} {...rest}>
      <span className={styles.range}>
        {to === 0 ? (
          `No ${unit}`
        ) : (
          <>
            <span className={styles.strong}>
              {fmt(from)}–{fmt(to)}
            </span>
            {total !== undefined ? <> of {fmt(total)}</> : null} {unit}
          </>
        )}
      </span>

      <div className={styles.controls}>
        {onPageSizeChange ? (
          <span className={styles.sizeGroup}>
            <label htmlFor={sizeId}>Rows</label>
            <Select
              id={sizeId}
              size="sm"
              className={styles.sizeSelect}
              value={String(pageSize)}
              options={pageSizes.map((s) => ({ value: String(s), label: String(s) }))}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            />
          </span>
        ) : null}

        <span className={styles.buttons}>
          <Button size="sm" disabled={!hasPrevious} onClick={onPrevious}>
            Previous
          </Button>
          <Button size="sm" disabled={!hasNext} onClick={onNext}>
            Next
          </Button>
        </span>
      </div>
    </div>
  );
});
