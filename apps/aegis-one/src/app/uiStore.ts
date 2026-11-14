import { create } from 'zustand';

const STORAGE_KEY = 'aegis.ui.v1';

interface Persisted {
  collapsed: boolean;
  expanded: Record<string, boolean>;
}

const DEFAULTS: Persisted = {
  collapsed: false,
  // Reference build opens Console and Operations and leaves the other groups closed.
  expanded: {
    console: true,
    operations: true,
    security: false,
    experience: false,
    infrastructure: false,
    organization: false,
  },
};

function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const p = parsed as Partial<Persisted>;
    return {
      collapsed: typeof p.collapsed === 'boolean' ? p.collapsed : DEFAULTS.collapsed,
      expanded: { ...DEFAULTS.expanded, ...(p.expanded ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

function save(state: Persisted): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: layout preference simply is not remembered */
  }
}

interface UiState extends Persisted {
  toggleCollapsed: () => void;
  toggleGroup: (id: string) => void;
  /** Opens a group without toggling it, used when navigation lands inside it. */
  expandGroup: (id: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  ...load(),
  toggleCollapsed: () => {
    set((s) => ({ collapsed: !s.collapsed }));
    save({ collapsed: get().collapsed, expanded: get().expanded });
  },
  toggleGroup: (id) => {
    set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } }));
    save({ collapsed: get().collapsed, expanded: get().expanded });
  },
  expandGroup: (id) => {
    if (get().expanded[id]) return;
    set((s) => ({ expanded: { ...s.expanded, [id]: true } }));
    save({ collapsed: get().collapsed, expanded: get().expanded });
  },
}));
