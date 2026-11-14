#!/usr/bin/env node
/**
 * Serves the approved reference so a browser can drive it.
 *
 * The reference bundle only enters its self-contained demo mode when it is
 * loaded over `file://` — otherwise it tries to fetch `/api/bootstrap` and
 * stops at "Console connection unavailable". Headless browsers and the
 * desktop app's own browser pane will not open a local file, so the page is
 * served over HTTP with that one check forced true and nothing else touched.
 *
 *   node scripts/ref-server.mjs                       v129 on 4100
 *   node scripts/ref-server.mjs <file> <port>         any other reference
 *
 * Read-only, loopback only, and it holds the patched copy in memory: the
 * reference on disk is never written to.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const FILE = resolve(process.argv[2] ?? 'design-reference/Aegis-One-Console-v129.html');
const PORT = Number(process.argv[3] ?? 4100);
const DEMO_CHECK = 'Et=location.protocol==="file:"';

let page;

async function body() {
  if (page) return page;
  const raw = await readFile(FILE, 'utf8');
  const found = raw.split(DEMO_CHECK).length - 1;
  if (found !== 1) {
    throw new Error(
      `expected exactly one demo-mode check in ${FILE}, found ${found} — ` +
        'the reference has changed and this script needs rechecking',
    );
  }
  page = raw.replace(DEMO_CHECK, 'Et=true');
  return page;
}

createServer((_req, res) => {
  void body().then(
    (html) => {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      res.end(html);
    },
    (err) => {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(String(err));
    },
  );
}).listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`reference on http://localhost:${PORT}/ (${FILE})\n`);
});
