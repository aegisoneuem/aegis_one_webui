import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type MutableRefObject,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../cx';
import { useOnEscape } from '../../hooks/useOnEscape';
import styles from './Popover.module.css';

export type PopoverAlign = 'start' | 'end';

export interface PopoverProps extends HTMLAttributes<HTMLDivElement> {
  /** The control the popover hangs off. */
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Which edge of the anchor the popover lines up with. */
  align?: PopoverAlign;
  /** Matches the popover width to the anchor; used by Select-like controls. */
  matchAnchorWidth?: boolean;
}

/**
 * Portalled layer positioned against an anchor, closing on Escape, outside
 * click and scroll of an ancestor. Menu, MultiSelect and DatePicker all build
 * on this rather than each doing their own positioning.
 *
 * Placement is measured at runtime and written straight to the node, so there
 * is no inline style attribute and no stylesheet that could know the numbers.
 */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover(
  {
    anchorRef,
    open,
    onClose,
    align = 'start',
    matchAnchorWidth = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const inner = useRef<HTMLDivElement | null>(null);

  const setRefs = (node: HTMLDivElement | null) => {
    inner.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as MutableRefObject<HTMLDivElement | null>).current = node;
  };

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const node = inner.current;
    if (!anchor || !node) return;
    const a = anchor.getBoundingClientRect();
    if (matchAnchorWidth) node.style.width = `${a.width}px`;
    const h = node.offsetHeight;
    const w = node.offsetWidth;

    // Flip above the anchor when there is not enough room below.
    const below = window.innerHeight - a.bottom;
    const top = below < h + 8 && a.top > h + 8 ? a.top - h - 4 : a.bottom + 4;

    let left = align === 'end' ? a.right - w : a.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));

    node.style.top = `${top}px`;
    node.style.left = `${left}px`;
    node.style.visibility = 'visible';
  }, [anchorRef, align, matchAnchorWidth]);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => place();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inner.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose, anchorRef]);

  useOnEscape(open, onClose);

  if (!open) return null;

  return createPortal(
    <div ref={setRefs} className={cx(styles.popover, className)} {...rest}>
      {children}
    </div>,
    document.body,
  );
});
