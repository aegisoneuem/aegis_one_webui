import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../cx';
import { Popover } from '../Popover/Popover';
import styles from './Tooltip.module.css';

export interface TooltipProps {
  /** Tooltip text. Keep it short; anything longer belongs in a hint or a drawer. */
  content: ReactNode;
  /** Delay before showing, so cursors crossing a toolbar do not flicker. */
  delayMs?: number;
  /** Monospace body, for truncated paths, hashes and command lines. */
  mono?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Hover and focus tooltip. The content is referenced with aria-describedby,
 * so it supplements the trigger's own accessible name rather than replacing
 * it; never put the only label for a control in here.
 */
export function Tooltip({
  content,
  delayMs = 350,
  mono = false,
  className,
  children,
}: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const id = useId();

  const show = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delayMs);
  };
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <>
      <span
        ref={anchor}
        className={cx(styles.wrap, className)}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>
      <Popover
        anchorRef={anchor}
        open={open}
        onClose={hide}
        id={id}
        role="tooltip"
        className={cx(styles.bubble, mono && styles.mono)}
      >
        {content}
      </Popover>
    </>
  );
}
