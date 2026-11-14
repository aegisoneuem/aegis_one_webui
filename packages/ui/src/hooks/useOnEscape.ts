import { useEffect } from 'react';

/** Calls `handler` on Escape while `active`. Used by every dismissible overlay. */
export function useOnEscape(active: boolean, handler: () => void): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handler();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [active, handler]);
}
