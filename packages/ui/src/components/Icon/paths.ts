/*
 * The approved icon set, taken from design-reference/Aegis-One-Console-v129.html
 * rather than from a package. Do not hand-edit: regenerate from the
 * reference if the set changes.
 *
 * Three shapes of glyph, which is how the reference draws them:
 *
 *   'nav'  24-unit box, stroke 2, square caps and mitred joins, with one
 *          filled accent square in the brand gold. These are the navigation
 *          and page icons, and they are what makes the console's chrome look
 *          like itself rather than like a stock icon pack.
 *   'line' 24-unit box, stroke 1.8, round caps. The back and home arrows.
 *   'fill' 256-unit box, filled. The top bar's search, bell and help, the
 *          sidebar's section carets and its collapse control.
 *
 * The reference draws the 'fill' glyphs from Phosphor. They are inlined here
 * instead of imported so the console ships one icon component and no icon
 * dependency; the geometry is the reference's, unchanged.
 */

export type IconKind = 'nav' | 'line' | 'fill';

export interface IconDef {
  readonly kind: IconKind;
  /** The 24-unit outline, or the 256-unit filled body. */
  readonly paths: readonly string[];
  /** The gold square a nav glyph carries, if it has one. */
  readonly accent?: string;
}

export const ICONS = {
  overview: {
    kind: 'nav',
    paths: ['M5 3H9L11 5V19L9 21H5L3 19V5ZM15 11H19L21 13V19L19 21H15L13 19V13Z'],
    accent: 'M14.5 3.5h5v5h-5Z',
  },
  devices: {
    kind: 'nav',
    paths: ['M5 4H19L21 6V14L19 16H5L3 14V6ZM9 20H15M12 16V20'],
    accent: 'M15.5 10h3v3h-3Z',
  },
  'device-groups': {
    kind: 'nav',
    paths: ['M10 3H19L21 5V11L19 13H10L8 11V5ZM5 7V15L7 17H16M2 11V19L4 21H12'],
    accent: 'M16 6h3v3h-3Z',
  },
  enrollment: {
    kind: 'nav',
    paths: ['M3 3H11L14 6V21H3ZM18.5 9.5V16.5M15 13H22'],
    accent: 'M5.5 6h3v3h-3Z',
  },
  patches: {
    kind: 'nav',
    paths: ['M12 3.5L20 8L12 12.5L4 8ZM4 12.5L12 17L20 12.5M4 16.5L12 21L20 16.5'],
    accent: 'M10.5 6.5h3v3h-3Z',
  },
  software: {
    kind: 'nav',
    paths: ['M4 4H20L21 5V7L20 8H4L3 7V5ZM4.5 8V19L6.5 21H17.5L19.5 19V8'],
    accent: 'M10.5 11h3v3h-3Z',
  },
  'live-operations': {
    kind: 'nav',
    paths: ['M3 8V3H8M16 3H21V8M21 16V21H16M8 21H3V16M12 5.5V8M12 16V18.5M5.5 12H8M16 12H18.5'],
    accent: 'M10.5 10.5h3v3h-3Z',
  },
  /*
   * Remote Control's glyph comes from v130, which is where the page comes
   * from: v129 has no remote control at all. Same 24-unit, stroke-2,
   * square-capped convention as the rest of the set.
   */
  'remote-control': {
    kind: 'nav',
    paths: ['M3 4H21V16H3ZM8 20H16M12 16V20'],
    accent: 'M10 7l5.5 2.6-2.4.7-.9 2.3Z',
  },
  deployments: {
    kind: 'nav',
    paths: ['M4 12V20H20V12M12 14.5V4M7.5 8.5L12 4L16.5 8.5'],
    accent: 'M10.5 16h3v3h-3Z',
  },
  vulnerabilities: {
    kind: 'nav',
    paths: ['M8 3H16L21 8V16L16 21H8L3 16V8ZM12 7V13'],
    accent: 'M10.5 15h3v3h-3Z',
  },
  configuration: {
    kind: 'nav',
    paths: ['M6 3V6M6 10V21M12 3V14.5M12 18.5V21M18 3V13M18 17V21M4 6H8V10H4ZM16 13H20V17H16Z'],
    accent: 'M10 14.5h4v4h-4Z',
  },
  dex: {
    kind: 'nav',
    paths: ['M3 18H21M5 18A7 7 0 0 1 19 18M12 18L15.5 13'],
    accent: 'M14.5 10.5h3v3h-3Z',
  },
  insight: {
    kind: 'nav',
    paths: ['M12 3L14.5 9.5L21 12L14.5 14.5L12 21L9.5 14.5L3 12L9.5 9.5Z'],
    accent: 'M10.5 10.5h3v3h-3Z',
  },
  zones: {
    kind: 'nav',
    paths: ['M3 3H9V9H3ZM15 3H21V9H15ZM3 15H9V21H3ZM9 6H15M6 9V15M18 9V15.5M9 18H15.5'],
    accent: 'M15.5 15.5h5v5h-5Z',
  },
  'peer-cache': {
    kind: 'nav',
    paths: ['M5 3H19L20 4V8L19 9H5L4 8V4ZM5 11H19L20 12V16L19 17H5L4 16V12ZM12 17V20M7 21H17'],
    accent: 'M6.5 4.5h3v3h-3Z',
  },
  reports: {
    kind: 'nav',
    paths: ['M5 3H15L19 7V21H5ZM8.5 17.5V14M12 17.5V11'],
    accent: 'M14.5 9h2.5v8.5h-2.5Z',
  },
  integrations: {
    kind: 'nav',
    paths: ['M3 3H14V14H3ZM10 10H21V21H10Z'],
    accent: 'M10 10h4v4h-4Z',
  },
  'api-access': {
    kind: 'nav',
    paths: ['M8 4.5H4.5V19.5H8M16 4.5H19.5V19.5H16'],
    accent: 'M10.5 10.5h3v3h-3Z',
  },
  administration: {
    kind: 'nav',
    paths: ['M10 3H14L16 5V9L14 11H10L8 9V5ZM4 21V17.5L7.5 14H16.5L20 17.5V21'],
    accent: 'M10.5 16.5h3v3h-3Z',
  },
  licensing: {
    kind: 'nav',
    paths: ['M3 8H11V16H3ZM11 12H21M17.5 12V16M20.5 12V15'],
    accent: 'M5.5 10.5h3v3h-3Z',
  },
  diagnostics: {
    kind: 'nav',
    paths: [
      'M6 3H18L20 5V19L18 21H6L4 19V5ZM11 8H17M11 12H17M11 16H17M7 11H9.5V13.5H7ZM7 15H9.5V17.5H7Z',
    ],
    accent: 'M7 6.75h2.5v2.5h-2.5Z',
  },
  encryption: {
    kind: 'nav',
    paths: ['M7 11H17L19 13V19L17 21H7L5 19V13ZM8 11V6L10 4H14L16 6V11'],
    accent: 'M10.5 14.5h3v3h-3Z',
  },
  gauge: {
    kind: 'nav',
    paths: ['M12 3L20 6V13L12 21L4 13V6Z'],
    accent: 'M10.5 9.5h3v3h-3Z',
  },
  logs: {
    kind: 'nav',
    paths: ['M4 5H20M4 10H20M4 15H14M4 20H10'],
    accent: 'M17 13.5h3v3h-3Z',
  },
  script: {
    kind: 'nav',
    paths: ['M5 4H19L21 6V18L19 20H5L3 18V6ZM7 9L10 12L7 15'],
    accent: 'M12 13.5h5v2.5h-5Z',
  },
  computer: {
    kind: 'nav',
    paths: ['M5 4H19L21 6V14L19 16H5L3 14V6ZM9 20H15M12 16V20'],
    accent: 'M15.5 10h3v3h-3Z',
  },
  offline: {
    kind: 'nav',
    paths: ['M5 4H19L21 6V14L19 16H5L3 14V6ZM9 20H15M12 16V20M2.5 2.5L21.5 21.5'],
    accent: 'M15.5 10h3v3h-3Z',
  },
  layers: {
    kind: 'nav',
    paths: ['M5 4H19L21 6V18L19 20H5L3 18V6ZM3 9H21'],
    accent: 'M16.5 5.25h3v2.5h-3Z',
  },
  apps: {
    kind: 'nav',
    paths: ['M4 4H20L21 5V7L20 8H4L3 7V5ZM4.5 8V19L6.5 21H17.5L19.5 19V8'],
    accent: 'M10.5 11h3v3h-3Z',
  },
  key: {
    kind: 'nav',
    paths: ['M3 8H11V16H3ZM11 12H21M17.5 12V16M20.5 12V15'],
    accent: 'M5.5 10.5h3v3h-3Z',
  },
  download: {
    kind: 'nav',
    paths: ['M4 12V20H20V12M12 4V13.5M7.5 9L12 13.5L16.5 9'],
    accent: 'M10.5 16h3v3h-3Z',
  },
  check: {
    kind: 'nav',
    paths: ['M6 3H18L21 6V18L18 21H6L3 18V6ZM7.5 12L10.5 15L16.5 9'],
    accent: 'M15.5 15.5h3v3h-3Z',
  },
  shield: {
    kind: 'nav',
    paths: ['M12 3L20 6V13L12 21L4 13V6Z'],
    accent: 'M10.5 9.5h3v3h-3Z',
  },
  lock: {
    kind: 'nav',
    paths: ['M7 11H17L19 13V19L17 21H7L5 19V13ZM8 11V6L10 4H14L16 6V11'],
    accent: 'M10.5 14.5h3v3h-3Z',
  },
  usb: {
    kind: 'nav',
    paths: ['M9 3H15V8H9ZM7 8H17V14L14 17H10L7 14ZM12 17V21'],
    accent: 'M10.5 10.5h3v3h-3Z',
  },
  activity: {
    kind: 'nav',
    paths: ['M3 18H21M5 18A7 7 0 0 1 19 18M12 18L15.5 13'],
    accent: 'M14.5 10.5h3v3h-3Z',
  },
  storage: {
    kind: 'nav',
    paths: ['M5 4H19L21 6V18L19 20H5L3 18V6ZM3 14H21'],
    accent: 'M15.5 16h3v2h-3Z',
  },
  send: {
    kind: 'nav',
    paths: ['M4 12V20H20V12M12 14.5V4M7.5 8.5L12 4L16.5 8.5'],
    accent: 'M10.5 16h3v3h-3Z',
  },
  clock: {
    kind: 'nav',
    paths: ['M8 3H16L21 8V16L16 21H8L3 16V8ZM12 6.5V10.5M13.5 12H16.5'],
    accent: 'M10.5 10.5h3v3h-3Z',
  },
  bank: {
    kind: 'nav',
    paths: ['M3 9L12 3.5L21 9M5 11V18M9.5 11V18M14.5 11V18M19 11V18M3 21H21'],
    accent: 'M10.75 6.25h2.5v2h-2.5Z',
  },
  briefcase: {
    kind: 'nav',
    paths: ['M4 8H20V19L18 21H6L4 19ZM9 8V5L10 4H14L15 5V8M4 13H20'],
    accent: 'M10.5 11.5h3v3h-3Z',
  },
  live: {
    kind: 'nav',
    paths: ['M3 8V3H8M16 3H21V8M21 16V21H16M8 21H3V16M12 5.5V8M12 16V18.5M5.5 12H8M16 12H18.5'],
    accent: 'M10.5 10.5h3v3h-3Z',
  },
  'caret-down': {
    kind: 'fill',
    paths: [
      'M216.49,104.49l-80,80a12,12,0,0,1-17,0l-80-80a12,12,0,0,1,17-17L128,159l71.51-71.52a12,12,0,0,1,17,17Z',
    ],
  },
  'caret-right': {
    kind: 'fill',
    paths: [
      'M184.49,136.49l-80,80a12,12,0,0,1-17-17L159,128,87.51,56.49a12,12,0,1,1,17-17l80,80A12,12,0,0,1,184.49,136.49Z',
    ],
  },
  sidebar: {
    kind: 'fill',
    paths: [
      'M216,36H40A20,20,0,0,0,20,56V200a20,20,0,0,0,20,20H216a20,20,0,0,0,20-20V56A20,20,0,0,0,216,36ZM44,60H76V196H44ZM212,196H100V60H212Z',
    ],
  },
  search: {
    kind: 'fill',
    paths: [
      'M232.49,215.51,185,168a92.12,92.12,0,1,0-17,17l47.53,47.54a12,12,0,0,0,17-17ZM44,112a68,68,0,1,1,68,68A68.07,68.07,0,0,1,44,112Z',
    ],
  },
  bell: {
    kind: 'fill',
    paths: [
      'M225.29,165.93C216.61,151,212,129.57,212,104a84,84,0,0,0-168,0c0,25.58-4.59,47-13.27,61.93A20.08,20.08,0,0,0,30.66,186,19.77,19.77,0,0,0,48,196H84.18a44,44,0,0,0,87.64,0H208a19.77,19.77,0,0,0,17.31-10A20.08,20.08,0,0,0,225.29,165.93ZM128,212a20,20,0,0,1-19.6-16h39.2A20,20,0,0,1,128,212ZM54.66,172C63.51,154,68,131.14,68,104a60,60,0,0,1,120,0c0,27.13,4.48,50,13.33,68Z',
    ],
  },
  help: {
    kind: 'fill',
    paths: [
      'M144,180a16,16,0,1,1-16-16A16,16,0,0,1,144,180Zm92-52A108,108,0,1,1,128,20,108.12,108.12,0,0,1,236,128Zm-24,0a84,84,0,1,0-84,84A84.09,84.09,0,0,0,212,128ZM128,64c-24.26,0-44,17.94-44,40v4a12,12,0,0,0,24,0v-4c0-8.82,9-16,20-16s20,7.18,20,16-9,16-20,16a12,12,0,0,0-12,12v8a12,12,0,0,0,23.73,2.56C158.31,137.88,172,122.37,172,104,172,81.94,152.26,64,128,64Z',
    ],
  },
  back: {
    kind: 'line',
    paths: ['m10 5-7 7 7 7M3 12h18'],
  },
  home: {
    kind: 'line',
    paths: ['m3 10 9-7 9 7v10H3z', 'M9 20v-7h6v7'],
  },
  'sign-out': {
    kind: 'line',
    paths: ['M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4', 'M10 8l-4 4 4 4M6 12h11'],
  },
  user: {
    kind: 'line',
    paths: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 20a8 8 0 0 1 16 0'],
  },
} as const satisfies Record<string, IconDef>;

export type IconName = keyof typeof ICONS;
