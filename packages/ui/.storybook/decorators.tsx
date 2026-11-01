import type { ReactNode } from 'react';
import './stories.css';

/** Row of variants, for stories that show several states side by side. */
export function Row({ children }: { children: ReactNode }) {
  return <div className="sb-row">{children}</div>;
}

/** Column stack with the same gutter as Row. */
export function Stack({ children }: { children: ReactNode }) {
  return <div className="sb-stack">{children}</div>;
}

/** Fixed-height box, for components that need a scroll container. */
export function Frame({ children }: { children: ReactNode }) {
  return <div className="sb-frame">{children}</div>;
}
