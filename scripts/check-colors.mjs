#!/usr/bin/env node
/**
 * Fails the build on any colour that is not approved.
 *
 * A colour is allowed only if it is on the approved token list or appears in
 * design-reference/Aegis-One-Console-v129.html. That second clause is what
 * makes this a restoration guard rather than a style preference: the reference
 * build is the specification, and anything outside it is drift.
 *
 * This exists because the console had already drifted once, and not obviously
 * — sixteen of the nineteen invented colours were within dRGB 30 of an
 * approved token. #E5E8EB where the design says #E5E9ED is invisible in review
 * and unmistakable in a diff.
 *
 *   node scripts/check-colors.mjs           report and exit non-zero on drift
 *   node scripts/check-colors.mjs --list    print the allowed palette
 */
import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const REFERENCE = join(ROOT, 'design-reference', 'Aegis-One-Console-v129.html');

/** The approved token list, verbatim. */
const APPROVED = {
  C6A16B: 'brand gold',
  E4C795: 'gold highlight',
  '7F6038': 'gold deep',
  F4EFE6: 'accent soft',
  FFF4E5: 'accent soft warm',
  F5F6F7: 'page canvas',
  FFFFFF: 'surface',
  EEF0F2: 'track',
  E5E9ED: 'border',
  '20262E': 'text',
  '69717D': 'muted',
  '8A9099': 'neutral',
  202329: 'sidebar',
  AEB2BC: 'sidebar text',
  '858A95': 'sidebar eyebrow',
  F6F8FA: 'sidebar brand',
  '8994A1': 'sidebar caption',
  '18354F': 'navy heading',
  '47617C': 'navy secondary',
  '0B1220': 'navy ink',
  '19845B': 'success',
  '15803D': 'status good',
  E8F6EF: 'status good bg',
  D6A009: 'warning',
  B7791F: 'status warn',
  FFF4DE: 'status warn bg',
  D34249: 'danger',
  C0262D: 'status bad',
  FCEBEC: 'status bad bg',
  '1D4ED8': 'status info',
  EAF1FD: 'status info bg',
  '94A3B8': 'status neutral',
  F1F4F8: 'status neutral bg',
  '0E9F6E': 'compliance green',
  B4790A: 'compliance amber',
  E4363D: 'compliance red',
  '1E3A5F': 'navy series 1',
  '2F5D8A': 'navy series 2',
  '4F7BAE': 'navy series 3',
  '7FA0C6': 'navy series 4',
  AFC3DB: 'navy series 5',
  E3E8EF: 'axis stroke',
};

const SCAN = ['apps', 'packages', 'scripts'];
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'storybook-static',
  'test-results',
  'data',
  'docs',
]);
const SCAN_EXT = new Set(['.css', '.ts', '.tsx', '.js', '.jsx', '.svg', '.html']);

const HEX = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

/** Expands #abc to #aabbcc and drops any alpha, so comparisons are like for like. */
function normalise(raw) {
  let h = raw.toUpperCase();
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  return h.slice(0, 6);
}

function referenceColors() {
  if (!existsSync(REFERENCE)) {
    console.error(
      `\nThe reference build is missing:\n  ${relative(ROOT, REFERENCE)}\n\n` +
        'It is the source of truth for every colour in this console. Restore it\n' +
        'before running this check — without it the check cannot tell drift from\n' +
        'the approved design, and passing would mean nothing.\n',
    );
    process.exit(2);
  }
  const text = readFileSync(REFERENCE, 'utf8');
  const found = new Set();
  for (const m of text.matchAll(HEX)) found.add(normalise(m[1]));
  return found;
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.storybook') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      yield* walk(full);
    } else if (SCAN_EXT.has(extname(e.name))) {
      yield full;
    }
  }
}

const inReference = referenceColors();
const allowed = new Set([...Object.keys(APPROVED), ...inReference]);

if (process.argv.includes('--list')) {
  console.log(`approved tokens: ${Object.keys(APPROVED).length}`);
  for (const [hex, name] of Object.entries(APPROVED)) console.log(`  #${hex}  ${name}`);
  console.log(`\ncolours present in v129: ${inReference.size}`);
  process.exit(0);
}

const offences = [];
for (const dir of SCAN) {
  for await (const file of walk(join(ROOT, dir))) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      // `&#9660;` and friends are HTML entities, not colours.
      const cleaned = line.replace(/&#\d+;/g, '');
      for (const m of cleaned.matchAll(HEX)) {
        const hex = normalise(m[1]);
        if (allowed.has(hex)) continue;
        offences.push({
          file: relative(ROOT, file).replace(/\\/g, '/'),
          line: i + 1,
          hex: m[0],
          text: line.trim().slice(0, 80),
        });
      }
    });
  }
}

if (offences.length === 0) {
  console.log(
    `colour check passed — every colour is on the approved list ` +
      `(${Object.keys(APPROVED).length}) or present in v129 (${inReference.size}).`,
  );
  process.exit(0);
}

/** Points at the nearest approved token, since drift is usually a near-miss. */
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
function nearest(hex) {
  const target = rgb(normalise(hex.replace('#', '')));
  let best = null;
  let bestDist = Infinity;
  for (const candidate of Object.keys(APPROVED)) {
    const c = rgb(candidate);
    const d = Math.hypot(...target.map((v, i) => v - c[i]));
    if (d < bestDist) {
      bestDist = d;
      best = candidate;
    }
  }
  return { best, dist: bestDist };
}

console.error(`\n${offences.length} unapproved colour(s):\n`);
for (const o of offences) {
  const { best, dist } = nearest(o.hex);
  const hint =
    dist < 30
      ? `  near-miss for #${best} (${APPROVED[best]}), dRGB ${dist.toFixed(1)} — use that`
      : `  nearest approved is #${best} (${APPROVED[best]})`;
  console.error(`  ${o.file}:${o.line}  ${o.hex}`);
  console.error(`    ${o.text}`);
  console.error(`  ${hint}\n`);
}
console.error(
  'Every colour must be on the approved token list or present in v129.\n' +
    'Read the value from design-reference/Aegis-One-Console-v129.html — do not pick one.\n',
);
process.exit(1);
